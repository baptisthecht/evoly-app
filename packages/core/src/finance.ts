import { estimateBankFee } from "./bankFees";
import type { Minor } from "./money";

export interface FinanceOrder {
  eventId: string;
  status: string;
  totalMinor: Minor;
  refundedMinor: Minor;
  applicationFeeMinor: Minor;
  /** Frais Stripe réels, connus après le paiement (RG-FEE-12). */
  paymentFeeMinor: Minor | null;
  tickets: number;
}

export interface FinanceTotals {
  orders: number;
  tickets: number;
  grossMinor: Minor;
  refundedMinor: Minor;
  commissionMinor: Minor;
  bankFeeMinor: Minor;
  /** Au moins un montant de frais bancaires est estimé (frais réels pas encore relevés). */
  bankFeeEstimated: boolean;
  netMinor: Minor;
}

const COUNTED = new Set(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);

/**
 * Totaux de la page Finances (US-FIN-01) : ventes brutes, remboursements, commissions Evoly (jamais restituées,
 * RG-FEE-40), frais bancaires, net. Une revente reste neutre : paiement de l'acheteur et remboursement du vendeur s'équilibrent.
 */
export function financeTotals(orders: readonly FinanceOrder[]): FinanceTotals {
  const t: FinanceTotals = { orders: 0, tickets: 0, grossMinor: 0, refundedMinor: 0, commissionMinor: 0, bankFeeMinor: 0, bankFeeEstimated: false, netMinor: 0 };
  for (const o of orders) {
    if (!COUNTED.has(o.status)) continue;
    t.orders += 1;
    t.tickets += o.tickets;
    t.grossMinor += o.totalMinor;
    t.refundedMinor += o.refundedMinor;
    t.commissionMinor += o.applicationFeeMinor;
    if (o.totalMinor > 0) {
      if (o.paymentFeeMinor == null) t.bankFeeEstimated = true;
      t.bankFeeMinor += o.paymentFeeMinor ?? estimateBankFee(o.totalMinor);
    }
  }
  t.netMinor = t.grossMinor - t.refundedMinor - t.commissionMinor - t.bankFeeMinor;
  return t;
}

/** Tableau par événement de la page Finances. */
export function financeByEvent(orders: readonly FinanceOrder[]): Map<string, FinanceTotals> {
  const groups = new Map<string, FinanceOrder[]>();
  for (const o of orders) groups.set(o.eventId, [...(groups.get(o.eventId) ?? []), o]);
  return new Map([...groups].map(([id, list]) => [id, financeTotals(list)]));
}

/** Taux normaux de TVA des pays de lancement (points de base). À tenir à jour. */
export const VAT_RATES_BPS: Readonly<Record<string, number>> = { BE: 2100, FR: 2000, LU: 1700, NL: 2100, IE: 2300, DE: 1900, AT: 2000, ES: 2100, IT: 2200, PT: 2300, FI: 2550 };
const EU = new Set(["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]);

export type VatMention = "BE_VAT" | "REVERSE_CHARGE" | "OSS" | "OUTSIDE_EU";

/**
 * TVA sur la commission d'Evoly (société belge), section RG-FEE-30. ⚠ À valider avec l'expert-comptable :
 * organisateur belge → TVA belge ; assujetti d'un autre pays de l'Union → autoliquidation ;
 * non assujetti de l'Union → TVA de son pays via le guichet unique (OSS) ; hors Union → hors champ.
 * Les commissions affichées sont toutes taxes comprises : la TVA est extraite du montant.
 */
export function commissionVat(org: { country: string; vatRegistered: boolean; vatNumber?: string | null }): { rateBps: number; mention: VatMention } {
  const country = org.country.toUpperCase();
  if (country === "BE") return { rateBps: VAT_RATES_BPS.BE!, mention: "BE_VAT" };
  if (!EU.has(country)) return { rateBps: 0, mention: "OUTSIDE_EU" };
  if (org.vatRegistered && org.vatNumber?.trim()) return { rateBps: 0, mention: "REVERSE_CHARGE" };
  return { rateBps: VAT_RATES_BPS[country] ?? VAT_RATES_BPS.BE!, mention: "OSS" };
}

/** TVA comprise dans un montant toutes taxes comprises, arrondie au centime. */
export function vatIncluded(totalMinor: Minor, rateBps: number): Minor {
  return rateBps <= 0 ? 0 : Math.round((totalMinor * rateBps) / (10_000 + rateBps));
}

/** Numéro de relevé : EVO-2026-000123 (séquence sans trou, RG-FEE-30). */
export function statementNumber(year: number, sequence: number): string {
  return `EVO-${year}-${String(sequence).padStart(6, "0")}`;
}
