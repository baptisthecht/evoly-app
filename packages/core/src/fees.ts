import { applyBps, assertNonNegative, type Bps, type Minor } from "./money";

/** Conditions de commission d'une offre dans une devise (PlanCurrencyTerms + Plan.feeRateBps). */
export interface FeeTerms {
  planId: string;
  currency: string;
  fixedMinor: Minor;
  rateBps: Bps;
  capMinor: Minor;
}

/** Conditions de référence en euros (CDC section 3.1). */
export const EUR_TERMS: Readonly<Record<"free" | "pro", FeeTerms>> = {
  free: { planId: "free", currency: "EUR", fixedMinor: 15, rateBps: 150, capMinor: 100 },
  pro: { planId: "pro", currency: "EUR", fixedMinor: 15, rateBps: 150, capMinor: 70 },
};

/**
 * Commission Evoly d'un billet (RG-FEE-01 à 03).
 * Billet gratuit : 0. Sinon arrondi(part fixe + prix × taux), plafonné.
 */
export function ticketCommission(pricePaidMinor: Minor, terms: FeeTerms): Minor {
  assertNonNegative(pricePaidMinor, "prix");
  if (pricePaidMinor === 0) return 0;
  return Math.min(terms.capMinor, applyBps(pricePaidMinor, terms.rateBps, terms.fixedMinor));
}

/** Instantané des conditions, enregistré dans Order.feeSnapshot (RG-FEE-04). */
export interface FeeSnapshot {
  planId: string;
  currency: string;
  fixedMinor: Minor;
  rateBps: Bps;
  capMinor: Minor;
}

export function feeSnapshot(terms: FeeTerms): FeeSnapshot {
  return { planId: terms.planId, currency: terms.currency, fixedMinor: terms.fixedMinor, rateBps: terms.rateBps, capMinor: terms.capMinor };
}

/** Prix à partir duquel le plafond est atteint (affichage : « plafond atteint dès … »). */
export function capThresholdMinor(terms: FeeTerms): Minor {
  // plus petit prix p tel que arrondi(fixe + p × taux) >= plafond
  const target = terms.capMinor - terms.fixedMinor;
  if (target <= 0) return 1;
  return Math.max(1, Math.ceil(((target - 0.5) * 10_000) / terms.rateBps));
}
