/** Langues disponibles au lancement (CDC 7.3, décision 7). Ajouter "nl" en P1, "de" et "es" en P2. */
export const LOCALES = ["fr", "en"] as const;
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
