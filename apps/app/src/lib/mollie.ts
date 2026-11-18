import "server-only";
import { CoreError } from "@evoly/core";
import { env } from "./env";

/**
 * Client Mollie (API v2 et OAuth) sur fetch, sans SDK (docs/MOLLIE.md) : Evoly n'appelle qu'une vingtaine de points
 * d'API. Montants en unités mineures côté Evoly, en texte décimal côté Mollie (« 12.34 »).
 */
export const MOLLIE_API = "https://api.mollie.com/v2";
const OAUTH_AUTHORIZE = "https://my.mollie.com/oauth2/authorize";
const OAUTH_TOKENS = "https://api.mollie.com/oauth2/tokens";
const TIMEOUT_MS = 20_000;

/** Droits demandés aux organisateurs, tous d'emblée : en ajouter plus tard oblige chacun à autoriser de nouveau. */
export const MOLLIE_SCOPES = [
  "organizations.read",
  "onboarding.read",
  "profiles.read",
  "profiles.write",
  "payments.read",
  "payments.write",
  "refunds.read",
  "refunds.write",
  "balances.read",
  "settlements.read",
] as const;

export type MollieAmount = { currency: string; value: string };

/** Erreur renvoyée par Mollie : statut HTTP, titre, détail, champ en cause, et code OAuth (invalid_grant…) s'il y a lieu. */
export class MollieError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail: string,
    public readonly field?: string,
    public readonly code?: string,
  ) {
    super(`Mollie ${status} ${title}${detail ? ` : ${detail}` : ""}`);
    this.name = "MollieError";
  }
}

/** Unités mineures (centimes) vers un montant Mollie, sans passer par un nombre à virgule. */
export function toMollieAmount(minor: number, currency: string): MollieAmount {
  if (!Number.isSafeInteger(minor))
    throw new Error(`Montant en centimes attendu : ${minor}`);
  const abs = Math.abs(minor);
  const value = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return {
    currency: currency.toUpperCase(),
    value: minor < 0 ? `-${value}` : value,
  };
}

/** Montant Mollie vers des unités mineures. */
export function fromMollieAmount(amount: MollieAmount): number {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.value);
  if (!m) throw new Error(`Montant Mollie illisible : ${amount.value}`);
  const minor = Number(m[2]) * 100 + Number((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -minor : minor;
}

const MOLLIE_LOCALES = new Set([
  "en_US",
  "en_GB",
  "nl_NL",
  "nl_BE",
  "de_DE",
  "de_AT",
  "de_CH",
  "fr_FR",
  "fr_BE",
  "es_ES",
  "ca_ES",
  "pt_PT",
  "it_IT",
  "nb_NO",
  "sv_SE",
  "fi_FI",
  "da_DK",
  "is_IS",
  "hu_HU",
  "pl_PL",
  "lv_LV",
  "lt_LT",
]);
const LANGUAGE_REGION: Record<string, string> = {
  en: "US",
  nl: "NL",
  de: "DE",
  fr: "FR",
  es: "ES",
  pt: "PT",
  it: "IT",
};

/** Langue des pages Mollie selon la langue et le pays : fr_BE pour une organisation belge francophone. */
export function mollieLocale(locale: string, country?: string | null): string {
  const lang = locale.slice(0, 2).toLowerCase();
  const local = country ? `${lang}_${country.toUpperCase()}` : "";
  if (MOLLIE_LOCALES.has(local)) return local;
  const fallback = `${lang}_${LANGUAGE_REGION[lang] ?? ""}`;
  return MOLLIE_LOCALES.has(fallback) ? fallback : "en_US";
}

type Query = Record<string, string | number | boolean | undefined>;
export interface MollieCall {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Query;
  body?: Record<string, unknown>;
  /** Clé d'idempotence (POST) : Mollie la garde une heure, liée au jeton utilisé. */
  idempotencyKey?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { detail: text.slice(0, 200) };
  }
}

async function call<T>(token: string, path: string, c: MollieCall): Promise<T> {
  const url = new URL(`${MOLLIE_API}${path}`);
  for (const [k, v] of Object.entries(c.query ?? {}))
    if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/hal+json",
  };
  if (c.body) headers["Content-Type"] = "application/json";
  if (c.idempotencyKey) headers["Idempotency-Key"] = c.idempotencyKey;
  const res = await fetch(url, {
    method: c.method ?? (c.body ? "POST" : "GET"),
    headers,
    body: c.body ? JSON.stringify(c.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 204) return undefined as T;
  const data = await readJson(res);
  if (!res.ok)
    throw new MollieError(
      res.status,
      str(data.title) ?? res.statusText,
      str(data.detail) ?? "",
      str(data.field),
    );
  return data as T;
}

/**
 * Appels avec un jeton : la clé d'API d'Evoly, ou le jeton OAuth d'un organisateur. Relié en mode test, chaque appel
 * porte `testmode` (dans le corps des POST et PATCH, dans l'adresse des autres).
 */
export function mollieApi(token: string, testmode = false) {
  return <T>(path: string, c: MollieCall = {}): Promise<T> => {
    if (!testmode) return call<T>(token, path, c);
    const method = c.method ?? (c.body ? "POST" : "GET");
    return method === "POST" || method === "PATCH"
      ? call<T>(token, path, {
          ...c,
          method,
          body: { ...c.body, testmode: true },
        })
      : call<T>(token, path, {
          ...c,
          method,
          query: { ...c.query, testmode: true },
        });
  };
}
export type MollieApi = ReturnType<typeof mollieApi>;

/** Compte Mollie d'Evoly (offre Pro) ; null tant que la clé n'est pas configurée. */
export function evolyMollie(): MollieApi | null {
  const key = env().MOLLIE_API_KEY;
  return key ? mollieApi(key) : null;
}

/** Application Mollie Connect configurée (comptes des organisateurs). */
export function mollieConnectConfigured(): boolean {
  const e = env();
  return !!(e.MOLLIE_CLIENT_ID && e.MOLLIE_CLIENT_SECRET);
}

/** Les organisateurs sont reliés en mode test (développement, recette). */
export const mollieTestmode = () => env().MOLLIE_TESTMODE === "true";

/** Page d'autorisation Mollie : création du compte (signup) ou connexion à un compte existant. */
export function oauthAuthorizeUrl(p: {
  state: string;
  redirectUri: string;
  signup: boolean;
  locale?: string;
}): string {
  const id = env().MOLLIE_CLIENT_ID;
  if (!id) throw new CoreError("MOLLIE_NOT_CONFIGURED");
  const url = new URL(OAUTH_AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: id,
    state: p.state,
    scope: MOLLIE_SCOPES.join(" "),
    response_type: "code",
    approval_prompt: "auto",
    redirect_uri: p.redirectUri,
    landing_page: p.signup ? "signup" : "login",
    ...(p.locale ? { locale: p.locale } : {}),
  }).toString();
  return url.toString();
}

export interface MollieTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

function oauthError(status: number, data: Record<string, unknown>) {
  const code = str(data.error);
  return new MollieError(
    status,
    code ?? str(data.title) ?? "oauth_error",
    str(data.error_description) ?? str(data.detail) ?? "",
    undefined,
    code,
  );
}

async function oauthRequest(
  method: "POST" | "DELETE",
  form: Record<string, string>,
): Promise<Response> {
  const { MOLLIE_CLIENT_ID: id, MOLLIE_CLIENT_SECRET: secret } = env();
  if (!id || !secret) throw new CoreError("MOLLIE_NOT_CONFIGURED");
  return fetch(OAUTH_TOKENS, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Jetons OAuth : échange du code reçu au retour de Mollie (valable 30 secondes), ou renouvellement. */
export async function oauthTokens(
  grant: { code: string; redirectUri: string } | { refreshToken: string },
): Promise<MollieTokens> {
  const res = await oauthRequest(
    "POST",
    "code" in grant
      ? {
          grant_type: "authorization_code",
          code: grant.code,
          redirect_uri: grant.redirectUri,
        }
      : { grant_type: "refresh_token", refresh_token: grant.refreshToken },
  );
  const data = await readJson(res);
  if (!res.ok || typeof data.access_token !== "string")
    throw oauthError(res.status, data);
  return data as unknown as MollieTokens;
}

/** Révoque un jeton ; révoquer le jeton de renouvellement révoque aussi les jetons d'accès de l'autorisation. */
export async function oauthRevoke(
  token: string,
  hint: "access_token" | "refresh_token",
): Promise<void> {
  const res = await oauthRequest("DELETE", { token_type_hint: hint, token });
  if (!res.ok) throw oauthError(res.status, await readJson(res));
}

export interface MollieLink {
  href: string;
  type?: string;
}
export interface MollieList<K extends string, T> {
  count: number;
  _embedded: Record<K, T[]>;
  _links: { next: MollieLink | null };
}

export interface MollieOrganization {
  id: string; // org_…
  name: string;
  email: string;
  locale?: string;
  registrationNumber?: string;
  vatNumber?: string | null;
  address?: { country?: string };
}

export interface MollieOnboarding {
  name: string;
  status: "needs-data" | "in-review" | "completed";
  canReceivePayments: boolean;
  canReceiveSettlements: boolean;
  _links: { dashboard?: MollieLink; organization?: MollieLink };
}

export interface MollieProfile {
  id: string; // pfl_…
  mode: "live" | "test";
  name: string;
  website: string;
  email: string;
  phone: string;
  status: "unverified" | "verified" | "blocked";
  review?: { status: "pending" | "rejected" };
}

export interface MollieMethod {
  id: string; // bancontact, creditcard, applepay…
  status?:
    | "activated"
    | "pending-boarding"
    | "pending-review"
    | "pending-external"
    | "rejected"
    | null;
}

export interface MolliePayment {
  id: string; // tr_…
  mode: "live" | "test";
  status:
    | "open"
    | "pending"
    | "authorized"
    | "paid"
    | "canceled"
    | "expired"
    | "failed";
  amount: MollieAmount;
  amountRefunded?: MollieAmount;
  amountChargedBack?: MollieAmount;
  description: string;
  method: string | null;
  metadata: Record<string, unknown> | null;
  profileId: string;
  createdAt: string;
  paidAt?: string;
  expiresAt?: string;
  details?: { cardFingerprint?: string; cardCountryCode?: string } | null;
  applicationFee?: { amount: MollieAmount; description: string };
  _links: { checkout?: MollieLink; dashboard?: MollieLink };
}

export interface MollieRefund {
  id: string; // re_…
  status:
    "queued" | "pending" | "processing" | "refunded" | "failed" | "canceled";
  amount: MollieAmount;
  paymentId: string;
  description?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface MollieChargeback {
  id: string; // chb_…
  amount: MollieAmount;
  paymentId: string;
  reason?: { code: string; description: string } | null;
  createdAt: string;
  reversedAt?: string | null;
}

export interface MollieBalance {
  id: string; // bal_…
  currency: string;
  availableAmount: MollieAmount;
  pendingAmount: MollieAmount;
}

export interface MollieSettlement {
  id: string; // stl_…
  reference?: string | null;
  status:
    | "open"
    | "pending"
    | "processing"
    | "processing-at-bank"
    | "paidout"
    | "failed"
    | "canceled";
  amount: MollieAmount;
  settledAt?: string | null;
  createdAt: string;
}
