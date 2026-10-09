/** Prévente privée (RG-PRV-01) : codes générés sans caractères ambigus (ni O et 0, ni I, L et 1). */
export const PRESALE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Code saisi par l'acheteur ou choisi par l'organisateur : majuscules, sans espaces. */
export function normalizePresaleCode(input: string): string {
  return input.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

/** Code personnalisé : 3 à 30 caractères, lettres, chiffres et tirets. */
export function isValidCustomPresaleCode(code: string): boolean {
  return /^[A-Z0-9-]{3,30}$/.test(code);
}
