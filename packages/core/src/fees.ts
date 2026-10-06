import { estimateBankFee } from "./bankFees";
import { applyBps, assertNonNegative, type Bps, type Minor } from "./money";

/** Conditions de commission d'une offre dans une devise (PlanCurrencyTerms + Plan.feeRateBps). */
export interface FeeTerms {
  planId: string;
  currency: string;
  fixedMinor: Minor;
  rateBps: Bps;
  capMinor: Minor;
}

/**
 * Conditions de référence en euros (grille d'octobre 2026) : 0,29 € + 2 % par billet payant, plafonnée à 2,50 € en Free
 * et à 1 € en Pro. Frais de paiement Stripe en sus, à la charge de l'organisateur : l'acheteur paie le prix affiché.
 */
export const EUR_TERMS: Readonly<Record<"free" | "pro" | "partner", FeeTerms>> = {
  free: { planId: "free", currency: "EUR", fixedMinor: 29, rateBps: 200, capMinor: 250 },
  pro: { planId: "pro", currency: "EUR", fixedMinor: 29, rateBps: 200, capMinor: 100 },
  partner: { planId: "partner", currency: "EUR", fixedMinor: 0, rateBps: 0, capMinor: 0 }, // offre Partenaire : aucune commission
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

/**
 * Ce que l'organisateur touche pour un billet vendu à ce prix : prix − commission − frais de paiement estimés
 * (carte européenne standard, un billet par paiement : le cas de référence, prudent).
 */
export function netForGross(grossMinor: Minor, terms: FeeTerms): Minor {
  assertNonNegative(grossMinor, "prix");
  if (grossMinor === 0) return 0;
  return grossMinor - ticketCommission(grossMinor, terms) - estimateBankFee(grossMinor);
}

/**
 * Aide au prix : le plus petit prix de vente pour lequel l'organisateur touche au moins `netMinor`.
 * Mêmes fonctions que les commandes réelles (arrondis, plafond compris) ; recherche dichotomique, le net étant croissant.
 */
export function grossForNet(netMinor: Minor, terms: FeeTerms): Minor {
  assertNonNegative(netMinor, "montant");
  if (netMinor === 0) return 0;
  let lo = netMinor,
    hi = netMinor * 2 + 1_000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (netForGross(mid, terms) >= netMinor) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Prix ronds proposés autour d'un prix (au demi-euro sous 20 €, à l'euro au-delà), sans le prix lui-même. */
export function roundedPriceOptions(grossMinor: Minor): Minor[] {
  if (grossMinor <= 0) return [];
  const step = grossMinor < 2_000 ? 50 : 100;
  const down = Math.floor(grossMinor / step) * step,
    up = Math.ceil(grossMinor / step) * step;
  return [...new Set([down, up])].filter((v) => v > 0 && v !== grossMinor);
}
