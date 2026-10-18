/**
 * Texte d'une cellule CSV, sans formule exécutable à l'ouverture dans un tableur (injection CSV, OWASP) : une cellule qui
 * commence par = + - @, une tabulation ou un retour chariot est précédée d'une apostrophe et lue comme du texte.
 * Les nombres, et les textes qui ne sont qu'un nombre (montant négatif « -12,50 »), restent des nombres.
 * Toutes les fabriques de CSV passent par ici (vérifié par test/csv.test.ts).
 */
export function csvSafe(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  const s = String(v);
  if (/^[=@\t\r]/.test(s)) return `'${s}`;
  if (/^[+-]/.test(s) && !/^[+-]?\d+(?:[.,]\d+)?$/.test(s)) return `'${s}`;
  return s;
}
