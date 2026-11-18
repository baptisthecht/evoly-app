/** Indicatifs des pays ouverts au lancement (lib/countries.ts de l'app). */
const CALLING_CODES: Readonly<Record<string, string>> = {
  BE: "32",
  FR: "33",
  LU: "352",
  NL: "31",
  IE: "353",
  DE: "49",
  AT: "43",
  ES: "34",
  IT: "39",
  PT: "351",
  FI: "358",
  GB: "44",
  CH: "41",
};

/**
 * Numéro de téléphone au format international E.164 (« +3245… »), exigé par Mollie pour le profil de l'organisateur.
 * Espaces, points, tirets, barres et parenthèses ignorés ; « 00 » vaut « + » ; un numéro national prend l'indicatif du
 * pays de l'organisation, sans son 0 de tête (sauf en Italie, où le 0 des fixes se garde). Illisible : null.
 */
export function toE164(raw: string, country: string): string | null {
  let n = raw.trim().replace(/[\s.\-/()]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (!n.startsWith("+")) {
    const code = CALLING_CODES[country.toUpperCase()];
    if (!code || !/^\d+$/.test(n)) return null;
    n = `+${code}${country.toUpperCase() !== "IT" ? n.replace(/^0/, "") : n}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}
