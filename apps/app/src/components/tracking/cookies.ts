import { CONSENT_COOKIE, CONSENT_MAX_AGE, cookieDomain, parseConsent, serializeConsent, type Consent } from "@evoly/core";

/** Cookies du traçage, posés sur tout le domaine (site vitrine et application), jamais lisibles par les billetteries tierces. */
export function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? m[1]! : null;
}
export function writeCookie(name: string, value: string, maxAge: number) {
  const domain = cookieDomain(location.hostname, process.env.NEXT_PUBLIC_BASE_DOMAIN ?? location.hostname);
  document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}${domain ? `; Domain=${domain}` : ""}`;
}
export const readConsent = (): Consent | null => parseConsent(readCookie(CONSENT_COOKIE));
export function saveConsent(c: Consent) {
  writeCookie(CONSENT_COOKIE, serializeConsent(c), CONSENT_MAX_AGE);
  window.dispatchEvent(new CustomEvent<Consent>("evoly:consent", { detail: c }));
}
/** Rouvre le bandeau (lien « Gérer les cookies »). */
export const openConsent = () => window.dispatchEvent(new Event("evoly:consent-open"));
