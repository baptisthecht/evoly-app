import { DEFAULT_LOCALE, isLocale, MESSAGES, negotiateLocale, type Locale } from "@evoly/i18n";
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALE_COOKIE = "evoly_locale";

/** Langue d'affichage : choix mémorisé, sinon langue du navigateur, sinon français (section 7.3). */
export async function resolveLocale(): Promise<Locale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const remembered = c.get(LOCALE_COOKIE)?.value;
  return negotiateLocale(h.get("accept-language"), isLocale(remembered) ? remembered : null, DEFAULT_LOCALE);
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: MESSAGES[locale], timeZone: "Europe/Brussels" };
});
