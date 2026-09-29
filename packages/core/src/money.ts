import { CoreError } from "./errors";

/** Montant entier en unités mineures (centimes). */
export type Minor = number;

/** Taux en points de base : 1 % = 100. */
export type Bps = number;

export function assertMinor(value: number, label = "montant"): void {
  if (!Number.isSafeInteger(value)) throw new CoreError("INVALID_AMOUNT", `${label} doit être un entier en unités mineures`);
}

export function assertNonNegative(value: number, label = "montant"): void {
  assertMinor(value, label);
  if (value < 0) throw new CoreError("NEGATIVE_AMOUNT", `${label} ne peut pas être négatif`);
}

/**
 * Applique un taux à un montant et arrondit au plus proche, 0,5 vers le haut.
 * Calcul entièrement en entiers pour éviter les erreurs d'arrondi flottant.
 */
export function applyBps(amount: Minor, rate: Bps, offset: Minor = 0): Minor {
  assertMinor(amount);
  assertMinor(rate, "taux");
  assertMinor(offset, "part fixe");
  return Math.floor((offset * 10_000 + amount * rate + 5_000) / 10_000);
}

export function sum(values: readonly Minor[]): Minor {
  return values.reduce((a, b) => a + b, 0);
}

export function normalizeCurrency(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new CoreError("INVALID_CURRENCY", `devise invalide : ${code}`);
  return c;
}

/**
 * Prix saisi par un organisateur vers des unités mineures : « 24 », « 24,5 », « 24.50 », « 1 234,56 ».
 * Renvoie null si la saisie n'est pas un montant valide (plus de décimales que la devise, signe, lettres…).
 */
export function parseMajorToMinor(input: string, exponent = 2): Minor | null {
  const s = input.trim().replace(/[\s\u00a0\u202f]/g, "").replace(/[€$£]/g, "");
  if (!s) return null;
  const m = /^(\d{1,7})(?:[.,](\d+))?$/.exec(s);
  if (!m) return null;
  const fraction = m[2] ?? "";
  if (fraction.length > exponent) return null;
  return Number(m[1]) * 10 ** exponent + Number(fraction.padEnd(exponent, "0") || "0");
}

/** Unités mineures vers la valeur d'un champ de saisie : 2450 → « 24,50 », 2400 → « 24 ». */
export function minorToInput(minor: Minor, exponent = 2, decimalSeparator = ","): string {
  const major = Math.floor(minor / 10 ** exponent);
  const rest = minor % 10 ** exponent;
  return rest === 0 ? String(major) : `${major}${decimalSeparator}${String(rest).padStart(exponent, "0")}`;
}
