/**
 * Mesure d'audience et de publicité, conforme au RGPD et à la directive ePrivacy (Belgique : consentement préalable,
 * refus aussi simple que l'acceptation). Logique pure, partagée par l'application ; le site vitrine en reprend la même
 * règle en JavaScript (apps/web/tracking.js).
 */

/** Choix de l'internaute, gardé un an sur tout le domaine (site vitrine et application). */
export const CONSENT_COOKIE = "evoly_consent";
/** Source de la première visite (campagne, site d'origine), gardée 90 jours. */
export const SOURCE_COOKIE = "evoly_src";
/** Événements confirmés par le serveur (inscription, organisation créée), lus puis effacés par la page suivante. */
export const EVENT_COOKIE = "evoly_evt";
/** Changer ce numéro redemande le consentement à tout le monde (nouvel outil, nouvelle finalité). */
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE = 365 * 24 * 3600;
export const SOURCE_MAX_AGE = 90 * 24 * 3600;

export interface Consent {
  v: number;
  /** Mesure d'audience (Google Analytics). */
  analytics: boolean;
  /** Publicité et mesure des campagnes (Google Ads). */
  ads: boolean;
  /** Date du choix (preuve du consentement). */
  at: string;
}

export function makeConsent(
  analytics: boolean,
  ads: boolean,
  now = new Date(),
): Consent {
  return { v: CONSENT_VERSION, analytics, ads, at: now.toISOString() };
}

/** Choix valable de la version en cours, sinon aucun (le bandeau s'affiche). */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(decodeURIComponent(raw)) as Partial<Consent>;
    if (
      c.v !== CONSENT_VERSION ||
      typeof c.analytics !== "boolean" ||
      typeof c.ads !== "boolean" ||
      typeof c.at !== "string"
    )
      return null;
    return {
      v: c.v,
      analytics: c.analytics,
      ads: c.ads,
      at: c.at.slice(0, 40),
    };
  } catch {
    return null;
  }
}

export const serializeConsent = (c: Consent) =>
  encodeURIComponent(JSON.stringify(c));

/** Signaux du mode Consentement v2 de Google : tout refusé tant que l'internaute n'a pas choisi. */
export function googleConsent(c: Consent | null) {
  const a = c?.analytics ? "granted" : "denied";
  const ad = c?.ads ? "granted" : "denied";
  return {
    analytics_storage: a,
    ad_storage: ad,
    ad_user_data: ad,
    ad_personalization: ad,
  } as const;
}

export interface Acquisition {
  source: string;
  medium: string;
  campaign: string | null;
  term: string | null;
  content: string | null;
  referrer: string | null;
  landing: string;
  firstAt: string;
  /** Identifiants de clic Google Ads : seulement avec le consentement à la publicité. */
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
}

const clip = (v: string | null | undefined, n = 120) => {
  const s = (v ?? "").replace(/[\u0000-\u001f<>"'`]/g, "").trim();
  return s ? s.slice(0, n) : null;
};
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
};
/** Le site vitrine, l'application et les billetteries ne sont jamais une « source ». */
const isOwn = (host: string, baseDomain: string) =>
  host === baseDomain ||
  host.endsWith(`.${baseDomain}`) ||
  host === "localhost";

/**
 * Source de la visite d'après son adresse : paramètres de campagne (utm_*), sinon le site d'origine, sinon « direct ».
 * Les identifiants de clic publicitaire ne sont gardés que si `adsAllowed`.
 */
export function acquisitionFromVisit(input: {
  url: string;
  referrer: string;
  baseDomain: string;
  adsAllowed: boolean;
  now?: Date;
}): Acquisition {
  const url = new URL(input.url);
  const q = (k: string) => clip(url.searchParams.get(k));
  const ref = input.referrer ? hostOf(input.referrer) : null;
  const external = ref && !isOwn(ref, input.baseDomain) ? ref : null;
  const gclid = q("gclid");
  const source = q("utm_source") ?? (gclid ? "google" : (external ?? "direct"));
  const medium =
    q("utm_medium") ??
    (gclid
      ? "cpc"
      : external
        ? /(^|\.)google\.|bing\.|duckduckgo\.|ecosia\.|qwant\./.test(external)
          ? "organic"
          : "referral"
        : "none");
  const a: Acquisition = {
    source,
    medium,
    campaign: q("utm_campaign"),
    term: q("utm_term"),
    content: q("utm_content"),
    referrer: external,
    landing: clip(url.pathname, 200) ?? "/",
    firstAt: (input.now ?? new Date()).toISOString(),
  };
  if (input.adsAllowed) {
    for (const k of ["gclid", "gbraid", "wbraid"] as const) {
      const v = q(k);
      if (v) a[k] = v.replace(/[^\w-]/g, "").slice(0, 120);
    }
  }
  return a;
}

/** Source lue depuis le cookie : champs connus seulement, bornés (un cookie peut être falsifié). */
export function parseAcquisition(
  raw: string | null | undefined,
): Acquisition | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const s = (k: string, n?: number) =>
      typeof a[k] === "string" ? clip(a[k] as string, n) : null;
    const source = s("source"),
      medium = s("medium");
    if (!source || !medium) return null;
    const out: Acquisition = {
      source,
      medium,
      campaign: s("campaign"),
      term: s("term"),
      content: s("content"),
      referrer: s("referrer"),
      landing: s("landing", 200) ?? "/",
      firstAt: s("firstAt", 40) ?? new Date(0).toISOString(),
    };
    for (const k of ["gclid", "gbraid", "wbraid"] as const) {
      const v = s(k);
      if (v) out[k] = v.replace(/[^\w-]/g, "");
    }
    return out;
  } catch {
    return null;
  }
}

export const serializeAcquisition = (a: Acquisition) =>
  encodeURIComponent(JSON.stringify(a));

/** Sans consentement à la publicité, les identifiants de clic sont retirés (retrait du consentement compris). */
export function withoutClickIds(a: Acquisition): Acquisition {
  const { gclid: _g, gbraid: _b, wbraid: _w, ...rest } = a;
  return rest;
}

/** Domaine des cookies : tout evoly.me (site et application) ; aucun en local. */
export function cookieDomain(
  hostname: string,
  baseDomain: string,
): string | undefined {
  const base = baseDomain.split(":")[0]!.toLowerCase();
  const host = hostname.toLowerCase();
  if (base === "localhost" || host === "localhost" || /^[\d.]+$/.test(host))
    return undefined;
  return host === base || host.endsWith(`.${base}`) ? `.${base}` : undefined;
}

/** Événements confirmés par le serveur, transmis à la page suivante par un cookie de quelques minutes. */
export type TrackedEvent = "sign_up" | "organization_created";
export function parseEvents(raw: string | null | undefined): TrackedEvent[] {
  if (!raw) return [];
  return decodeURIComponent(raw)
    .split(",")
    .filter(
      (e): e is TrackedEvent => e === "sign_up" || e === "organization_created",
    );
}
