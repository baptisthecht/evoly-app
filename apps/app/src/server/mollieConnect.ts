import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { can, CoreError, toE164 } from "@evoly/core";
import type { MollieAccount, MollieOnboardingStatus } from "@evoly/db";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  mollieApi,
  mollieConnectConfigured,
  mollieLocale,
  mollieTestmode,
  oauthAuthorizeUrl,
  oauthTokens,
  type MollieList,
  type MollieMethod,
  type MollieOnboarding,
  type MollieOrganization,
  type MollieProfile,
} from "@/lib/mollie";
import { safeError } from "@/lib/redact";
import { audit } from "./audit";
import { findOrgContext, type OrgContext } from "./context";
import {
  mollieForOrganization,
  mollieReady,
  revokeMollieAuthorization,
  saveMollieAuthorization,
} from "./mollieAccounts";
import { notify } from "./notifications";
import { organizationPublicUrl } from "./urls";
import { getSession } from "./session";

/**
 * Liaison du compte Mollie d'un organisateur (Mollie Connect pour plateformes, docs/MOLLIE.md, lot 2) : autorisation
 * OAuth, profil de site et moyens de paiement préparés pour Evoly, état relu chez Mollie (qui n'envoie pas d'événement
 * pour l'inscription), déconnexion.
 */
const STATE_COOKIE = "evoly_mollie";
const STATE_TTL_MS = 15 * 60_000;
/** Cartes d'abord : Mollie n'active Apple Pay qu'avec les cartes. */
const METHODS = ["creditcard", "bancontact", "applepay"] as const;
const ONBOARDING: Record<MollieOnboarding["status"], MollieOnboardingStatus> = {
  "needs-data": "NEEDS_DATA",
  "in-review": "IN_REVIEW",
  completed: "COMPLETED",
};

type From = "onboarding" | "settings";
type State = { o: string; u: string; n: string; e: number; f: From };

export const mollieRedirectUri = () =>
  `${env().NEXT_PUBLIC_APP_URL}/api/mollie/oauth`;

const stateKey = () =>
  createHash("sha256")
    .update(`mollie-state:${env().BETTER_AUTH_SECRET}`)
    .digest();

function signState(s: State): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  const mac = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** État renvoyé par Mollie : signé par Evoly et pas encore expiré, sinon null. */
export function readMollieState(raw: string | null): State | null {
  const [body, mac, extra] = (raw ?? "").split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = createHmac("sha256", stateKey()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const ok =
      typeof s.o === "string" &&
      typeof s.u === "string" &&
      typeof s.n === "string" &&
      typeof s.e === "number" &&
      (s.f === "onboarding" || s.f === "settings") &&
      s.e > Date.now();
    return ok ? (s as State) : null;
  } catch {
    return null;
  }
}

/**
 * Début de la liaison (permission PAYMENTS_MANAGE) : le téléphone du profil Mollie, exigé au format international, est
 * enregistré sur l'organisation ; puis la page d'autorisation de Mollie (création du compte ou connexion), avec un état
 * signé et lié à ce navigateur par un cookie.
 */
export async function startMollieConnection(
  ctx: OrgContext,
  input: { phone: string; signup: boolean; from: From },
): Promise<string> {
  if (!mollieConnectConfigured()) throw new CoreError("MOLLIE_NOT_CONFIGURED");
  const phone = toE164(input.phone, ctx.organization.country);
  if (!phone) throw new CoreError("MOLLIE_PHONE_INVALID");
  await db.organization.update({
    where: { id: ctx.organization.id },
    data: { phone },
  });
  const nonce = randomBytes(16).toString("base64url");
  (await cookies()).set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/mollie",
    maxAge: STATE_TTL_MS / 1000,
  });
  return oauthAuthorizeUrl({
    state: signState({
      o: ctx.organization.id,
      u: ctx.user.id,
      n: nonce,
      e: Date.now() + STATE_TTL_MS,
      f: input.from,
    }),
    redirectUri: mollieRedirectUri(),
    signup: input.signup,
    locale: mollieLocale(ctx.organization.locale, ctx.organization.country),
  });
}

/**
 * Retour de Mollie : état vérifié (signature, délai, cookie du même navigateur, même utilisateur, toujours autorisé à
 * gérer l'encaissement), code échangé aussitôt (il ne vaut que 30 secondes), compte enregistré, profil et moyens de
 * paiement préparés, état relu. Rend l'adresse où renvoyer l'organisateur, avec le résultat dans `?mollie=`.
 */
export async function completeMollieConnection(
  params: URLSearchParams,
): Promise<string> {
  const jar = await cookies();
  const nonce = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/mollie" });
  const state = readMollieState(params.get("state"));
  const session = await getSession();
  if (
    !state ||
    !nonce ||
    state.n !== nonce ||
    !session ||
    session.user.id !== state.u
  )
    return "/?mollie=MOLLIE_STATE_INVALID";
  const org = await db.organization.findUnique({
    where: { id: state.o },
    select: { slug: true },
  });
  if (!org) return "/";
  const back = (result: string) =>
    state.f === "onboarding"
      ? `/onboarding/payments?org=${org.slug}&mollie=${result}`
      : `/o/${org.slug}/settings/payments?mollie=${result}`;
  const ctx = await findOrgContext(state.u, org.slug);
  if (!ctx || ctx.readOnly || !can(ctx.membership, "PAYMENTS_MANAGE"))
    return back("FORBIDDEN");
  const error = params.get("error");
  if (error)
    return back(error === "access_denied" ? "denied" : "MOLLIE_UNAVAILABLE");
  const code = params.get("code");
  if (!code) return back("MOLLIE_UNAVAILABLE");
  try {
    const tokens = await oauthTokens({
      code,
      redirectUri: mollieRedirectUri(),
    });
    const me = await mollieApi(tokens.access_token)<MollieOrganization>(
      "/organizations/me",
    );
    const account = await saveMollieAuthorization({
      organizationId: state.o,
      mollieOrganizationId: me.id,
      tokens,
      testmode: mollieTestmode(),
    });
    await audit({
      action: "mollie.connected",
      organizationId: state.o,
      actorUserId: state.u,
      targetType: "MollieAccount",
      targetId: account.id,
      metadata: { mollieOrganizationId: me.id, testmode: account.testmode },
    });
    // compte relié même si Mollie refuse un moment le profil : la tâche horaire et la page Paiements reprennent
    await prepareMollieAccount(state.o, session.user.email).catch((e) =>
      console.error("préparation du compte Mollie", safeError(e)),
    );
    return back("connected");
  } catch (e) {
    if (e instanceof CoreError) return back(e.code);
    console.error("liaison Mollie", safeError(e));
    return back("MOLLIE_UNAVAILABLE");
  }
}

/** Page publique de l'organisation, déclarée comme site du profil Mollie. */
function publicSite(subdomain: string | null): string {
  return subdomain
    ? organizationPublicUrl(subdomain)
    : env().NEXT_PUBLIC_SITE_URL;
}

/**
 * Profil de site pour Evoly, créé s'il manque (nom, page publique, e-mail et téléphone de l'organisation), avec les
 * cartes, Bancontact et Apple Pay demandés ; puis l'état relu. Un moyen refusé n'empêche pas les autres.
 */
export async function prepareMollieAccount(
  organizationId: string,
  fallbackEmail?: string,
): Promise<MollieAccount | null> {
  const mollie = await mollieForOrganization(organizationId);
  if (!mollie) return null;
  if (!mollie.account.profileId) {
    const org = await db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        name: true,
        subdomain: true,
        contactEmail: true,
        phone: true,
        country: true,
        members: {
          where: { status: "ACTIVE", role: { systemKey: "OWNER" } },
          select: { user: { select: { email: true } } },
          take: 1,
        },
      },
    });
    const profile = await mollie.plain<MollieProfile>("/profiles", {
      body: {
        name: org.name,
        website: publicSite(org.subdomain),
        email: org.contactEmail ?? fallbackEmail ?? org.members[0]?.user.email,
        phone: org.phone,
        description: "Billetterie en ligne (Evoly)",
        countriesOfActivity: [org.country],
      },
      idempotencyKey: `profile:${mollie.account.id}`,
    });
    await db.mollieAccount.update({
      where: { id: mollie.account.id },
      data: { profileId: profile.id, profileStatus: profile.status },
    });
    for (const method of METHODS)
      await mollie
        .plain(`/profiles/${profile.id}/methods/${method}`, { method: "POST" })
        .catch((e) =>
          console.error(`moyen de paiement ${method}`, safeError(e)),
        );
  }
  return syncMollieAccount(organizationId);
}

/**
 * Relit l'état du compte chez Mollie : inscription, versements, profil et moyens de paiement actifs. Prévient
 * l'organisateur quand Mollie demande des informations alors qu'il pouvait encaisser, et quand le compte n'est plus
 * relié (autorisation retirée chez Mollie).
 */
export async function syncMollieAccount(
  organizationId: string,
): Promise<MollieAccount | null> {
  const before = await db.mollieAccount.findUnique({
    where: { organizationId },
  });
  if (!before || before.disconnectedAt) return before;
  let mollie;
  try {
    mollie = await mollieForOrganization(organizationId);
  } catch (e) {
    if (e instanceof CoreError && e.code === "MOLLIE_RECONNECT_REQUIRED") {
      await notify(organizationId, "MOLLIE_ACTION_REQUIRED", {
        title: "Compte Mollie",
        body: "Votre compte Mollie n'est plus relié à Evoly : reliez-le de nouveau pour continuer à vendre des billets payants.",
        link: "/settings/payments",
      });
      return db.mollieAccount.findUnique({ where: { organizationId } });
    }
    throw e;
  }
  if (!mollie) return null;
  const { account, api, plain } = mollie;
  const onboarding = await plain<MollieOnboarding>("/onboarding/me");
  const profile = account.profileId
    ? await plain<MollieProfile>(`/profiles/${account.profileId}`)
    : null;
  const methods = account.profileId
    ? await api<MollieList<"methods", MollieMethod>>("/methods", {
        query: { profileId: account.profileId, includeWallets: "applepay" },
      })
    : null;
  const after = await db.mollieAccount.update({
    where: { id: account.id },
    data: {
      onboardingStatus: ONBOARDING[onboarding.status],
      canReceivePayments: onboarding.canReceivePayments,
      canReceiveSettlements: onboarding.canReceiveSettlements,
      onboardingUrl: onboarding._links.dashboard?.href ?? null,
      profileStatus: profile?.status ?? account.profileStatus,
      methods: methods
        ? methods._embedded.methods.map((m) => m.id)
        : account.methods,
      syncedAt: new Date(),
    },
  });
  if (mollieReady(before) && !mollieReady(after))
    await notify(organizationId, "MOLLIE_ACTION_REQUIRED", {
      title: "Compte Mollie",
      body: "Mollie demande des informations pour que les paiements et les virements continuent.",
      link: "/settings/payments",
    });
  return after;
}

/** Déconnexion par l'organisateur (permission PAYMENTS_MANAGE) : autorisation révoquée chez Mollie. */
export async function disconnectMollie(ctx: OrgContext): Promise<void> {
  const account = await db.mollieAccount.findUnique({
    where: { organizationId: ctx.organization.id },
  });
  if (!account || account.disconnectedAt) throw new CoreError("NOT_FOUND");
  await revokeMollieAuthorization(account);
  await audit({
    action: "mollie.disconnected",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "MollieAccount",
    targetId: account.id,
  });
}

/**
 * Tâche horaire : relit les comptes pas encore prêts, et les autres une fois par jour (une autorisation retirée chez
 * Mollie se voit ainsi sans attendre un paiement). Une erreur sur un compte n'arrête pas les suivants.
 */
export async function syncMollieAccounts(now = new Date()): Promise<number> {
  const accounts = await db.mollieAccount.findMany({
    where: {
      disconnectedAt: null,
      OR: [
        { syncedAt: null },
        { syncedAt: { lt: new Date(now.getTime() - 24 * 3600_000) } },
        { onboardingStatus: { not: "COMPLETED" } },
        { canReceivePayments: false },
        { profileStatus: { not: "verified" } },
        { profileStatus: null },
      ],
    },
    select: { organizationId: true },
    orderBy: { syncedAt: { sort: "asc", nulls: "first" } },
    take: 100,
  });
  let synced = 0;
  for (const { organizationId } of accounts) {
    try {
      const account = await db.mollieAccount.findUnique({
        where: { organizationId },
      });
      if (account && !account.profileId && !account.disconnectedAt)
        await prepareMollieAccount(organizationId);
      else await syncMollieAccount(organizationId);
      synced++;
    } catch (e) {
      console.error("relecture du compte Mollie", safeError(e));
    }
  }
  return synced;
}
