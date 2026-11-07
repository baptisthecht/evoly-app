import type { Locale } from "./locales";

const INTL_LOCALE: Record<Locale, string> = {
  fr: "fr-BE",
  en: "en-GB",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  nl: "nl-BE",
};

/** Nombre de décimales d'une devise (2 pour l'euro, 0 pour le yen…). */
export function currencyExponent(currency: string): number {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency);
}

/** Montant en unités mineures vers texte : 2400 EUR → « 24,00 € » (fr) ou « €24.00 » (en). */
export function formatMoney(
  minor: number,
  currency: string,
  locale: Locale,
  /** trimZeroCents : « 18 € » au lieu de « 18,00 € » ; units : arrondi à l'unité (« +1 240 € », une évolution). */
  options: { trimZeroCents?: boolean; units?: boolean } = {},
): string {
  const value = fromMinor(minor, currency);
  const exp = currencyExponent(currency);
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency,
    minimumFractionDigits:
      options.units || (options.trimZeroCents && whole) ? 0 : exp,
    maximumFractionDigits: options.units ? 0 : exp,
  }).format(value);
}

/** Pourcentage depuis des points de base : 150 → « 1,5 % ». */
export function formatBps(bps: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
}

/** Date et heure dans le fuseau de l'événement (RG-I18N-02). */
export function formatDateTime(
  date: Date,
  timeZone: string,
  locale: Locale,
  style: "long" | "short" = "long",
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    dateStyle: style === "long" ? "full" : "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(
  date: Date,
  timeZone: string,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatTime(
  date: Date,
  timeZone: string,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Date courte (« 21 nov. », « 1er déc. »), dans le fuseau de l'événement ; en français, le premier du mois en ordinal. */
export function formatShortDate(
  date: Date,
  timeZone: string,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    day: "numeric",
    month: "short",
  })
    .formatToParts(date)
    .map((p) =>
      p.type === "day" && locale === "fr" && p.value === "1" ? "1er" : p.value,
    )
    .join("");
}

/**
 * Date longue et heure d'un événement (refonte A3, maquettes UIUX/) : « Samedi 21 novembre 2026, 20:00 », la majuscule
 * en tête, une virgule avant l'heure (jamais de point médian).
 */
export function formatEventWhen(
  date: Date,
  timeZone: string,
  locale: Locale,
): string {
  const day = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const text = `${day}, ${formatTime(date, timeZone, locale)}`;
  return text.charAt(0).toLocaleUpperCase(INTL_LOCALE[locale]) + text.slice(1);
}

/**
 * Date courte et heure d'un événement, sur téléphone (refonte A3, maquette « Sur téléphone ») : « Sam. 21 nov., 20:00 »,
 * la majuscule en tête, « 1er » en français.
 */
export function shortEventWhen(
  date: Date,
  timeZone: string,
  locale: Locale,
): string {
  const day = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .formatToParts(date)
    .map((p) =>
      p.type === "day" && locale === "fr" && p.value === "1" ? "1er" : p.value,
    )
    .join("");
  const text = `${day}, ${formatTime(date, timeZone, locale)}`;
  return text.charAt(0).toLocaleUpperCase(INTL_LOCALE[locale]) + text.slice(1);
}

/** Abréviation du fuseau (« UTC+1 »…), affichée quand elle diffère de celle de l'acheteur. */
export function timeZoneLabel(
  date: Date,
  timeZone: string,
  locale: Locale,
): string {
  const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** Feuille de calendrier (refonte A3) : le jour et le mois abrégé, dans le fuseau de l'événement (« 21 », « nov. »). */
export function formatDayMonth(
  date: Date,
  timeZone: string,
  locale: Locale,
): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    day: "numeric",
    month: "short",
  }).formatToParts(date);
  return {
    day: parts.find((p) => p.type === "day")?.value ?? "",
    month: parts.find((p) => p.type === "month")?.value ?? "",
  };
}
