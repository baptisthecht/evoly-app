import type { Locale } from "./locales";

const INTL_LOCALE: Record<Locale, string> = { fr: "fr-BE", en: "en-GB", es: "es-ES", de: "de-DE", it: "it-IT", pt: "pt-PT", nl: "nl-BE" };

/** Nombre de décimales d'une devise (2 pour l'euro, 0 pour le yen…). */
export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency);
}

/** Montant en unités mineures vers texte : 2400 EUR → « 24,00 € » (fr) ou « €24.00 » (en). */
export function formatMoney(minor: number, currency: string, locale: Locale, options: { trimZeroCents?: boolean } = {}): string {
  const value = fromMinor(minor, currency);
  const exp = currencyExponent(currency);
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: options.trimZeroCents && whole ? 0 : exp,
    maximumFractionDigits: exp,
  }).format(value);
}

/** Pourcentage depuis des points de base : 150 → « 1,5 % ». */
export function formatBps(bps: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
}

/** Date et heure dans le fuseau de l'événement (RG-I18N-02). */
export function formatDateTime(date: Date, timeZone: string, locale: Locale, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    dateStyle: style === "long" ? "full" : "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(date: Date, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone, day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatTime(date: Date, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Abréviation du fuseau (« UTC+1 »…), affichée quand elle diffère de celle de l'acheteur. */
export function timeZoneLabel(date: Date, timeZone: string, locale: Locale): string {
  const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone, timeZoneName: "shortOffset" }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
