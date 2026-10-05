/** Langues de l'app (section 7.3). fr et en sont complètes ; les autres se complètent progressivement, avec repli sur l'anglais. */
export const LOCALES = ["fr", "en", "es", "de", "it", "pt", "nl"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Choisit la langue d'affichage à partir de l'en-tête Accept-Language du navigateur (RG-I18N, section 7.3).
 * Ordre : préférence mémorisée, langues du navigateur par poids, langue de repli.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined, remembered?: string | null, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (isLocale(remembered)) return remembered;
  if (!acceptLanguage) return fallback;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: (tag ?? "").toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.tag && !Number.isNaN(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return fallback;
}

/** Nom de chaque langue dans sa propre langue (sélecteurs). */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  fr: "Français",
  en: "English",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
};

/**
 * Langue des textes écrits dans le code (e-mails, relevés, Wallet…) tant qu'ils n'existent qu'en français et en anglais :
 * le français pour le français, l'anglais pour toutes les autres langues (plus universel qu'un repli sur le français).
 */
export function baseLocale(locale: string | null | undefined): "fr" | "en" {
  return locale === "fr" ? "fr" : "en";
}

/** Une langue connue, sinon le repli indiqué. */
export function toLocale(value: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  return isLocale(value) ? value : fallback;
}

/** Texte d'un modèle dans la langue demandée, sinon en anglais (modèles traduits progressivement). */
export function pick<C extends { en: unknown }>(copy: C, locale: string | null | undefined): C["en"] {
  const all = copy as unknown as Partial<Record<Locale, C["en"]>>;
  return (isLocale(locale) ? all[locale] : undefined) ?? copy.en;
}
