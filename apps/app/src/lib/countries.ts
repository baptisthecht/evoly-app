import type { Locale } from "@evoly/i18n";

/** Pays ouverts au lancement : zone euro (décision 7). Devise, fuseau et langue par défaut. */
export const LAUNCH_COUNTRIES = [
  { code: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr", name: { fr: "Belgique", en: "Belgium" } },
  { code: "FR", currency: "EUR", timezone: "Europe/Paris", locale: "fr", name: { fr: "France", en: "France" } },
  { code: "LU", currency: "EUR", timezone: "Europe/Luxembourg", locale: "fr", name: { fr: "Luxembourg", en: "Luxembourg" } },
  { code: "NL", currency: "EUR", timezone: "Europe/Amsterdam", locale: "en", name: { fr: "Pays-Bas", en: "Netherlands" } },
  { code: "IE", currency: "EUR", timezone: "Europe/Dublin", locale: "en", name: { fr: "Irlande", en: "Ireland" } },
  { code: "DE", currency: "EUR", timezone: "Europe/Berlin", locale: "en", name: { fr: "Allemagne", en: "Germany" } },
  { code: "AT", currency: "EUR", timezone: "Europe/Vienna", locale: "en", name: { fr: "Autriche", en: "Austria" } },
  { code: "ES", currency: "EUR", timezone: "Europe/Madrid", locale: "en", name: { fr: "Espagne", en: "Spain" } },
  { code: "IT", currency: "EUR", timezone: "Europe/Rome", locale: "en", name: { fr: "Italie", en: "Italy" } },
  { code: "PT", currency: "EUR", timezone: "Europe/Lisbon", locale: "en", name: { fr: "Portugal", en: "Portugal" } },
  { code: "FI", currency: "EUR", timezone: "Europe/Helsinki", locale: "en", name: { fr: "Finlande", en: "Finland" } },
] as const satisfies ReadonlyArray<{ code: string; currency: string; timezone: string; locale: Locale; name: Record<Locale, string> }>;

export type CountryCode = (typeof LAUNCH_COUNTRIES)[number]["code"];

export function findCountry(code: string) {
  return LAUNCH_COUNTRIES.find((c) => c.code === code) ?? null;
}
