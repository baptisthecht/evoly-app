import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  negotiateLocale,
} from "@evoly/i18n";

/** Cookie de la langue choisie dans l'interface (même nom que i18n/request.ts). */
const LOCALE_COOKIE = "evoly_locale";

/**
 * Langue d'un organisateur qui s'inscrit par Google ou Apple : celle choisie
 * dans l'interface, sinon celle du navigateur, sinon le français. Sans elle,
 * ses e-mails (mot de passe oublié…) partiraient toujours en français.
 */
export function localeFromRequest(headers: Headers | null | undefined): Locale {
  const cookie = headers?.get("cookie") ?? "";
  const remembered = cookie
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([name]) => name === LOCALE_COOKIE)?.[1];
  return negotiateLocale(
    headers?.get("accept-language") ?? null,
    isLocale(remembered) ? remembered : null,
    DEFAULT_LOCALE,
  );
}

/**
 * Données d'un nouvel utilisateur : au retour de Google ou d'Apple
 * (« /callback/… »), la langue de la requête ; sinon inchangées (inscription
 * par e-mail : langue du formulaire).
 */
export function withSocialLocale<U extends object>(
  user: U,
  ctx:
    { path?: string; headers?: Headers; request?: Request } | null | undefined,
): U {
  if (!ctx?.path?.startsWith("/callback")) return user;
  return {
    ...user,
    locale: localeFromRequest(ctx.headers ?? ctx.request?.headers),
  };
}
