import "server-only";
import { CoreError } from "@evoly/core";
import type { MollieAccount } from "@evoly/db";
import { db } from "@/lib/db";
import {
  MollieError,
  mollieApi,
  oauthRevoke,
  oauthTokens,
  type MollieApi,
  type MollieTokens,
} from "@/lib/mollie";
import { sealer } from "@/lib/seal";

/**
 * Comptes Mollie des organisateurs (docs/MOLLIE.md) : jetons OAuth chiffrés en base. Le jeton d'accès vaut une heure et
 * se renouvelle 5 minutes avant son expiration (les clés d'idempotence de Mollie sont liées au jeton) ; le jeton de
 * renouvellement n'expire pas. Refusé par Mollie, le compte est marqué à relier de nouveau.
 */
const tokens = sealer("mollie-oauth");
const RENEW_BEFORE_MS = 5 * 60_000;

const expiry = (t: MollieTokens) => new Date(Date.now() + t.expires_in * 1000);

/**
 * Autorisation donnée par l'organisateur : nouveau compte, ou compte relié de nouveau. Un compte Mollie ne sert qu'une
 * organisation ; relié à un autre compte Mollie, l'organisation repart de zéro (profil, moyens de paiement, état).
 */
export async function saveMollieAuthorization(input: {
  organizationId: string;
  mollieOrganizationId: string;
  tokens: MollieTokens;
  testmode: boolean;
}): Promise<MollieAccount> {
  const t = input.tokens;
  if (!t.refresh_token)
    throw new CoreError("MOLLIE_UNAVAILABLE", "jeton de renouvellement absent");
  const other = await db.mollieAccount.findUnique({
    where: { mollieOrganizationId: input.mollieOrganizationId },
    select: { organizationId: true },
  });
  if (other && other.organizationId !== input.organizationId)
    throw new CoreError("MOLLIE_ACCOUNT_IN_USE");
  const current = await db.mollieAccount.findUnique({
    where: { organizationId: input.organizationId },
    select: { mollieOrganizationId: true, testmode: true },
  });
  const sameAccount =
    current?.mollieOrganizationId === input.mollieOrganizationId &&
    current.testmode === input.testmode;
  const data = {
    mollieOrganizationId: input.mollieOrganizationId,
    testmode: input.testmode,
    refreshToken: tokens.seal(t.refresh_token),
    accessToken: tokens.seal(t.access_token),
    accessTokenExpiresAt: expiry(t),
    scopes: t.scope.split(" ").filter(Boolean),
    disconnectedAt: null,
    ...(sameAccount
      ? {}
      : {
          profileId: null,
          profileStatus: null,
          methods: [],
          onboardingStatus: "NEEDS_DATA" as const,
          canReceivePayments: false,
          canReceiveSettlements: false,
        }),
  };
  return db.mollieAccount.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId, ...data },
    update: data,
  });
}

/** Jeton d'accès valable pour ce compte, renouvelé au besoin. */
export async function mollieAccessToken(
  account: MollieAccount,
  retried = false,
): Promise<string> {
  if (account.disconnectedAt) throw new CoreError("MOLLIE_RECONNECT_REQUIRED");
  if (
    account.accessToken &&
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt.getTime() - Date.now() > RENEW_BEFORE_MS
  )
    return tokens.open(account.accessToken);
  let t: MollieTokens;
  try {
    t = await oauthTokens({ refreshToken: tokens.open(account.refreshToken) });
  } catch (e) {
    if (!(e instanceof MollieError) || e.code !== "invalid_grant") throw e;
    // un autre appel a pu renouveler entre-temps (jeton remplacé) : on relit une fois avant de conclure
    const fresh = await db.mollieAccount.findUnique({
      where: { id: account.id },
    });
    if (!retried && fresh && fresh.refreshToken !== account.refreshToken)
      return mollieAccessToken(fresh, true);
    await db.mollieAccount.update({
      where: { id: account.id },
      data: {
        disconnectedAt: new Date(),
        accessToken: null,
        accessTokenExpiresAt: null,
      },
    });
    throw new CoreError("MOLLIE_RECONNECT_REQUIRED");
  }
  await db.mollieAccount.update({
    where: { id: account.id },
    data: {
      accessToken: tokens.seal(t.access_token),
      accessTokenExpiresAt: expiry(t),
      ...(t.refresh_token
        ? { refreshToken: tokens.seal(t.refresh_token) }
        : {}),
    },
  });
  return t.access_token;
}

/**
 * API Mollie pour le compte relié d'une organisation ; null sans compte Mollie. `api` porte le mode test du compte
 * (paiements, remboursements, moyens de paiement) ; `plain` sert aux ressources communes aux deux modes (organisation,
 * inscription, profils).
 */
export async function mollieForOrganization(organizationId: string): Promise<{
  account: MollieAccount;
  api: MollieApi;
  plain: MollieApi;
} | null> {
  const account = await db.mollieAccount.findUnique({
    where: { organizationId },
  });
  if (!account) return null;
  const token = await mollieAccessToken(account);
  return {
    account,
    api: mollieApi(token, account.testmode),
    plain: mollieApi(token),
  };
}

/**
 * Le compte peut recevoir des paiements de billets : relié, profil non bloqué et au moins un moyen de paiement actif ;
 * en mode réel, inscription acceptée par Mollie et profil vérifié (en mode test, Mollie accepte les paiements de test
 * avant).
 */
export function mollieReady(
  a: Pick<
    MollieAccount,
    | "disconnectedAt"
    | "testmode"
    | "canReceivePayments"
    | "profileId"
    | "profileStatus"
    | "methods"
  >,
): boolean {
  if (a.disconnectedAt || !a.profileId || a.profileStatus === "blocked")
    return false;
  if (a.methods.length === 0) return false;
  return a.testmode || (a.canReceivePayments && a.profileStatus === "verified");
}

/**
 * Déconnexion par l'organisateur : jeton de renouvellement révoqué chez Mollie (ses jetons d'accès avec lui), compte
 * marqué à relier. Une autorisation déjà retirée chez Mollie ne bloque pas la déconnexion.
 */
export async function revokeMollieAuthorization(
  account: MollieAccount,
): Promise<void> {
  try {
    await oauthRevoke(tokens.open(account.refreshToken), "refresh_token");
  } catch (e) {
    // déjà retirée chez Mollie, ou application Connect plus configurée : la déconnexion se fait côté Evoly
    const local =
      e instanceof MollieError ||
      (e instanceof CoreError && e.code === "MOLLIE_NOT_CONFIGURED");
    if (!local) throw e;
  }
  await db.mollieAccount.update({
    where: { id: account.id },
    data: {
      disconnectedAt: new Date(),
      accessToken: null,
      accessTokenExpiresAt: null,
      canReceivePayments: false,
    },
  });
}
