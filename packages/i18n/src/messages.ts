import en from "../messages/en.json";
import fr from "../messages/fr.json";
import type { Locale } from "./locales";

export type Messages = typeof fr;

export const MESSAGES: Record<Locale, Messages> = { fr, en };

/** Liste plate des clés (« checkout.pay »…), pour vérifier que toutes les langues sont complètes. */
export function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}
