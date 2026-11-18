import { applyBps, type Bps, type Minor } from "./money";

/** Moyens de paiement de référence pour les estimations (RG-FEE-11). */
export type PaymentMethodKind =
  | "card_eea_standard"
  | "card_eea_premium"
  | "card_international"
  | "bancontact"
  | "ideal_wero";

/**
 * Grille Mollie de référence pour un compte belge, relevée le 18 novembre 2026 (mollie.com/be/pricing) : cartes
 * européennes de particuliers, cartes professionnelles européennes, cartes hors Europe, Bancontact, iDEAL.
 * Sert uniquement aux estimations affichées : les frais réels viennent de Mollie (RG-FEE-12).
 */
export const MOLLIE_REFERENCE_EUR: Readonly<
  Record<PaymentMethodKind, { fixedMinor: Minor; rateBps: Bps }>
> = {
  card_eea_standard: { fixedMinor: 25, rateBps: 180 },
  card_eea_premium: { fixedMinor: 25, rateBps: 290 },
  card_international: { fixedMinor: 25, rateBps: 325 },
  bancontact: { fixedMinor: 39, rateBps: 0 },
  ideal_wero: { fixedMinor: 32, rateBps: 0 },
};

/** Frais d'un remboursement chez Mollie, pris sur le solde de l'organisateur (0,25 € selon des sources tierces, à confirmer avec Mollie). */
export const MOLLIE_REFUND_FEE_MINOR: Minor = 25;

/** Frais bancaires estimés pour un paiement, d'après la grille de Mollie. */
export function estimateBankFee(
  amountMinor: Minor,
  kind: PaymentMethodKind = "card_eea_standard",
): Minor {
  if (amountMinor <= 0) return 0;
  const ref = MOLLIE_REFERENCE_EUR[kind];
  return applyBps(amountMinor, ref.rateBps, ref.fixedMinor);
}

/**
 * Frais bancaires d'une revente, à la charge du vendeur (RG-FEE-51) : ceux du paiement de l'acheteur (réels, ou
 * estimés), plus, quand le vendeur avait payé en ligne, les frais du remboursement qui lui rend son argent.
 * L'organisateur reste ainsi neutre.
 */
export function resaleBankFee(
  priceMinor: Minor,
  sellerPaidOnline: boolean,
  buyerPaymentFeeMinor?: Minor | null,
): Minor {
  if (priceMinor <= 0) return 0;
  const payment = buyerPaymentFeeMinor ?? estimateBankFee(priceMinor);
  return payment + (sellerPaidOnline ? MOLLIE_REFUND_FEE_MINOR : 0);
}

/** Ce que l'organisateur touche : prix − commission − frais bancaires (RG-FEE-21). */
export function organizerNet(
  priceMinor: Minor,
  commissionMinor: Minor,
  bankFeeMinor: Minor,
): Minor {
  return priceMinor - commissionMinor - bankFeeMinor;
}
