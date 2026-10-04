import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import it from "../messages/it.json";
import nl from "../messages/nl.json";
import pt from "../messages/pt.json";
import type { Locale } from "./locales";

export type Messages = typeof fr;

/** Textes d'une langue en cours de traduction, complétés par l'anglais pour tout ce qui manque encore. */
function withFallback(partial: unknown, base: unknown): unknown {
  if (typeof base !== "object" || base === null) return typeof partial === "string" && partial !== "" ? partial : base;
  const p = (typeof partial === "object" && partial !== null ? partial : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(base as Record<string, unknown>).map(([k, v]) => [k, withFallback(p[k], v)]));
}

/** Langues dont le fichier de textes peut être partiel (repli sur l'anglais). */
export const PARTIAL_MESSAGES: Readonly<Record<Exclude<Locale, "fr" | "en">, unknown>> = { es, de, it, pt, nl };

export const MESSAGES: Record<Locale, Messages> = {
  fr,
  en,
  ...(Object.fromEntries(Object.entries(PARTIAL_MESSAGES).map(([l, m]) => [l, withFallback(m, en)])) as Record<Exclude<Locale, "fr" | "en">, Messages>),
};

/** Liste plate des clés (« checkout.pay »…), pour vérifier que toutes les langues sont complètes. */
export function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}
