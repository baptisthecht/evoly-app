import { applyBps, type Bps, type Minor } from "./money";

/** Moyens de paiement de référence pour les estimations (RG-FEE-11). */
export type PaymentMethodKind = "card_eea_standard" | "card_eea_premium" | "card_international" | "bancontact" | "ideal_wero";

/**
 * Grille Stripe de référence pour un compte belge, relevée en septembre 2026.
 * Sert uniquement aux estimations affichées : les frais réels viennent de Stripe (RG-FEE-12).
 */
export const STRIPE_REFERENCE_EUR: Readonly<Record<PaymentMethodKind, { fixedMinor: Minor; rateBps: Bps }>> = {
  card_eea_standard: { fixedMinor: 25, rateBps: 150 },
  card_eea_premium: { fixedMinor: 25, rateBps: 280 },
  card_international: { fixedMinor: 25, rateBps: 315 },
  bancontact: { fixedMinor: 35, rateBps: 0 },
  ideal_wero: { fixedMinor: 29, rateBps: 0 },
};

/** Frais Stripe estimés pour un paiement. */
export function estimateBankFee(amountMinor: Minor, kind: PaymentMethodKind = "card_eea_standard"): Minor {
  if (amountMinor <= 0) return 0;
  const ref = STRIPE_REFERENCE_EUR[kind];
  return applyBps(amountMinor, ref.rateBps, ref.fixedMinor);
}

/** Ce que l'organisateur touche : prix − commission − frais bancaires (RG-FEE-21). */
export function organizerNet(priceMinor: Minor, commissionMinor: Minor, bankFeeMinor: Minor): Minor {
  return priceMinor - commissionMinor - bankFeeMinor;
}
