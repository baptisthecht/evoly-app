import { ticketCommission, type FeeTerms } from "./fees";
import type { Minor } from "./money";

export type ResaleBlocker =
  | "EVENT_RESALE_DISABLED"
  | "TICKET_TYPE_RESALE_DISABLED"
  | "EVENT_NOT_ON_SALE"
  | "CUTOFF_PASSED"
  | "TICKET_NOT_VALID"
  | "ALREADY_LISTED"
  | "PAYMENT_NOT_REFUNDABLE";

export interface ResaleEligibilityInput {
  eventStatus: string;
  eventResaleEnabled: boolean;
  ticketTypeResaleAllowed: boolean;
  eventStartsAt: Date;
  resaleCutoffMinutes: number;
  ticketStatus: "VALID" | "CHECKED_IN" | "VOID" | "REFUNDED";
  hasOpenListing: boolean;
  /** false si le paiement d'origine ne peut plus être remboursé (RG-RSL-05). Toujours vrai pour un billet gratuit. */
  originalPaymentRefundable: boolean;
  now: Date;
}

/** Fin de la revente : début de l'événement moins le délai (2 heures par défaut). */
export function resaleCutoff(eventStartsAt: Date, cutoffMinutes: number): Date {
  return new Date(eventStartsAt.getTime() - cutoffMinutes * 60_000);
}

/** RG-RSL-01 et RG-RSL-03 à 05 : un billet peut-il être mis en revente ? */
export function resaleBlockers(i: ResaleEligibilityInput): ResaleBlocker[] {
  const b: ResaleBlocker[] = [];
  if (!i.eventResaleEnabled) b.push("EVENT_RESALE_DISABLED");
  if (!i.ticketTypeResaleAllowed) b.push("TICKET_TYPE_RESALE_DISABLED");
  if (i.eventStatus !== "PUBLISHED" && i.eventStatus !== "SALES_PAUSED") b.push("EVENT_NOT_ON_SALE");
  if (i.now.getTime() >= resaleCutoff(i.eventStartsAt, i.resaleCutoffMinutes).getTime()) b.push("CUTOFF_PASSED");
  if (i.ticketStatus !== "VALID") b.push("TICKET_NOT_VALID");
  if (i.hasOpenListing) b.push("ALREADY_LISTED");
  if (!i.originalPaymentRefundable) b.push("PAYMENT_NOT_REFUNDABLE");
  return b;
}

/** RG-RSL-02 : le prix de revente ne dépasse jamais la valeur faciale. */
export function checkResalePrice(priceMinor: Minor, faceValueMinor: Minor): "OK" | "ABOVE_FACE_VALUE" | "NEGATIVE" | "NOT_INTEGER" {
  if (!Number.isSafeInteger(priceMinor)) return "NOT_INTEGER";
  if (priceMinor < 0) return "NEGATIVE";
  return priceMinor <= faceValueMinor ? "OK" : "ABOVE_FACE_VALUE";
}

export interface ResaleAmounts {
  /** Montant payé par l'acheteur. */
  buyerPaysMinor: Minor;
  /** Commission Evoly prélevée sur le paiement de l'acheteur. */
  commissionMinor: Minor;
  /** Frais bancaires du paiement de l'acheteur (réels si connus, sinon estimés). */
  bankFeeMinor: Minor;
  /** Montant rendu au vendeur par remboursement partiel de sa commande d'origine. */
  sellerRefundMinor: Minor;
}

/**
 * Montants d'une revente (RG-FEE-50 à 52, RG-RSL-12). Décision validée : les frais sont à la charge du vendeur.
 * L'acheteur paie le prix affiché ; le vendeur récupère ce prix moins la commission et les frais bancaires ;
 * l'organisateur reste neutre. Revente à 0 € : transfert, sans paiement ni remboursement (RG-RSL-04).
 */
export function resaleAmounts(priceMinor: Minor, terms: FeeTerms, bankFeeMinor: Minor): ResaleAmounts {
  if (priceMinor === 0) return { buyerPaysMinor: 0, commissionMinor: 0, bankFeeMinor: 0, sellerRefundMinor: 0 };
  const commissionMinor = ticketCommission(priceMinor, terms);
  return {
    buyerPaysMinor: priceMinor,
    commissionMinor,
    bankFeeMinor,
    sellerRefundMinor: Math.max(0, priceMinor - commissionMinor - bankFeeMinor),
  };
}

/** Moyens de paiement dont Stripe ne permet pas le remboursement (ou seulement hors ligne, par virement manuel). */
const NON_REFUNDABLE_METHODS = new Set(["multibanco", "oxxo", "boleto", "konbini"]);
/** Délai au-delà duquel un remboursement n'est plus garanti par les réseaux de paiement (180 jours pour la plupart). */
const REFUND_WINDOW_DAYS = 175;

/**
 * RG-RSL-05 : le paiement d'origine peut-il encore être remboursé au vendeur ?
 * Billet gratuit : toujours (transfert). Sinon : moyen de paiement remboursable, paiement récent, commande non remboursée en entier.
 */
export function originalPaymentRefundable(order: { totalMinor: Minor; refundedMinor: Minor; paymentMethodType: string | null; paidAt: Date | null; status: string }, faceValueMinor: Minor, now: Date): boolean {
  if (faceValueMinor === 0 || order.totalMinor === 0) return true;
  if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED") return false;
  if (order.paymentMethodType && NON_REFUNDABLE_METHODS.has(order.paymentMethodType)) return false;
  if (!order.paidAt || now.getTime() - order.paidAt.getTime() > REFUND_WINDOW_DAYS * 86_400_000) return false;
  return order.totalMinor - order.refundedMinor >= faceValueMinor;
}

export interface PublicListing {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  priceMinor: Minor;
  createdAt: Date;
}

/** RG-PUB-04 : annonces regroupées par tarif, triées par prix puis par ancienneté. */
export function groupListings(listings: readonly PublicListing[]) {
  const sorted = [...listings].sort((a, b) => a.priceMinor - b.priceMinor || a.createdAt.getTime() - b.createdAt.getTime());
  const groups = new Map<string, { ticketTypeId: string; ticketTypeName: string; count: number; fromMinor: Minor; listings: PublicListing[] }>();
  for (const l of sorted) {
    const g = groups.get(l.ticketTypeId) ?? { ticketTypeId: l.ticketTypeId, ticketTypeName: l.ticketTypeName, count: 0, fromMinor: l.priceMinor, listings: [] };
    g.count += 1;
    g.listings.push(l);
    groups.set(l.ticketTypeId, g);
  }
  return [...groups.values()].sort((a, b) => a.fromMinor - b.fromMinor);
}
