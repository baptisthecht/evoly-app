import type { Minor } from "./money";

/** Prix minimum d'un billet payant par devise (RG-TKT-01, décision 8). */
export const MIN_PAID_PRICE: Readonly<Record<string, Minor>> = { EUR: 100, GBP: 100, CHF: 100, USD: 100, CAD: 100, AUD: 100 };

export type PriceCheck = "OK" | "NEGATIVE" | "NOT_INTEGER" | "BELOW_MINIMUM";

export function checkTicketPrice(priceMinor: number, currency: string): PriceCheck {
  if (!Number.isSafeInteger(priceMinor)) return "NOT_INTEGER";
  if (priceMinor < 0) return "NEGATIVE";
  if (priceMinor === 0) return "OK";
  return priceMinor >= (MIN_PAID_PRICE[currency] ?? 100) ? "OK" : "BELOW_MINIMUM";
}

/** RG-TKT-05 : prix de base figé après la première vente. */
export function canEditBasePrice(ticketType: { priceLockedAt?: Date | null; quantitySold: number }): boolean {
  return !ticketType.priceLockedAt && ticketType.quantitySold === 0;
}

/** RG-TKT-05 : la quantité ne peut pas descendre sous le nombre déjà vendu ou réservé. */
export function canSetQuantity(newQuantity: number | null, ticketType: { quantitySold: number; quantityHeld: number }): boolean {
  if (newQuantity == null) return true;
  return Number.isInteger(newQuantity) && newQuantity >= ticketType.quantitySold + ticketType.quantityHeld;
}

/** RG-TKT-06 : suppression uniquement sans vente ; sinon masquer ou archiver. */
export function canDeleteTicketType(ticketType: { quantitySold: number; quantityHeld: number }): boolean {
  return ticketType.quantitySold === 0 && ticketType.quantityHeld === 0;
}

/** RG-TKT-09 : prix d'un palier figé dès sa première vente ; dates et quota restent modifiables. */
export function canEditTierPrice(tier: { lockedAt?: Date | null; quantitySold: number }): boolean {
  return !tier.lockedAt && tier.quantitySold === 0;
}

/** RG-EVT-02 : conditions de publication d'un événement. */
export function publicationBlockers(input: {
  activeTicketTypes: number;
  hasPaidTicketTypes: boolean;
  stripeChargesEnabled: boolean;
  startsAt: Date;
  now: Date;
}): Array<"NO_TICKET_TYPE" | "STRIPE_REQUIRED" | "IN_THE_PAST"> {
  const blockers: Array<"NO_TICKET_TYPE" | "STRIPE_REQUIRED" | "IN_THE_PAST"> = [];
  if (input.activeTicketTypes === 0) blockers.push("NO_TICKET_TYPE");
  if (input.hasPaidTicketTypes && !input.stripeChargesEnabled) blockers.push("STRIPE_REQUIRED");
  if (input.startsAt.getTime() <= input.now.getTime()) blockers.push("IN_THE_PAST");
  return blockers;
}
