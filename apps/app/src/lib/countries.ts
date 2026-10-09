import type { Locale } from "@evoly/i18n";

/** Pays ouverts au lancement : zone euro (décision 7). Devise, fuseau et langue par défaut. */
export const LAUNCH_COUNTRIES = [
  { code: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr", name: { fr: "Belgique", en: "Belgium" } },
  { code: "FR", currency: "EUR", timezone: "Europe/Paris", locale: "fr", name: { fr: "France", en: "France" } },
  { code: "LU", currency: "EUR", timezone: "Europe/Luxembourg", locale: "fr", name: { fr: "Luxembourg", en: "Luxembourg" } },
  { code: "NL", currency: "EUR", timezone: "Europe/Amsterdam", locale: "nl", name: { fr: "Pays-Bas", en: "Netherlands" } },
  { code: "IE", currency: "EUR", timezone: "Europe/Dublin", locale: "en", name: { fr: "Irlande", en: "Ireland" } },
  { code: "DE", currency: "EUR", timezone: "Europe/Berlin", locale: "de", name: { fr: "Allemagne", en: "Germany" } },
  { code: "AT", currency: "EUR", timezone: "Europe/Vienna", locale: "de", name: { fr: "Autriche", en: "Austria" } },
  { code: "ES", currency: "EUR", timezone: "Europe/Madrid", locale: "es", name: { fr: "Espagne", en: "Spain" } },
  { code: "IT", currency: "EUR", timezone: "Europe/Rome", locale: "it", name: { fr: "Italie", en: "Italy" } },
  { code: "PT", currency: "EUR", timezone: "Europe/Lisbon", locale: "pt", name: { fr: "Portugal", en: "Portugal" } },
  { code: "FI", currency: "EUR", timezone: "Europe/Helsinki", locale: "en", name: { fr: "Finlande", en: "Finland" } },
  { code: "GB", currency: "GBP", timezone: "Europe/London", locale: "en", name: { fr: "Royaume-Uni", en: "United Kingdom" } },
  { code: "CH", currency: "CHF", timezone: "Europe/Zurich", locale: "fr", name: { fr: "Suisse", en: "Switzerland" } },
] as const satisfies ReadonlyArray<{ code: string; currency: string; timezone: string; locale: Locale; name: { fr: string; en: string } }>;

export type CountryCode = (typeof LAUNCH_COUNTRIES)[number]["code"];

export function findCountry(code: string) {
  return LAUNCH_COUNTRIES.find((c) => c.code === code) ?? null;
}
