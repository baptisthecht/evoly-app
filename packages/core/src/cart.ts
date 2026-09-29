import { CoreError } from "./errors";
import { ticketCommission, feeSnapshot, type FeeSnapshot, type FeeTerms } from "./fees";
import { sum, type Minor } from "./money";
import { promoAppliesTo, unitDiscount, type PromoInput } from "./promo";
import { allocateTiers, type PriceTierInput } from "./tiers";

export type TicketTypeStatus = "ACTIVE" | "PAUSED" | "SOLD_OUT" | "ARCHIVED";
export type TicketVisibility = "VISIBLE" | "HIDDEN" | "CODE_ONLY";
export type EventStatus = "DRAFT" | "PUBLISHED" | "SALES_PAUSED" | "CANCELLED" | "ENDED" | "ARCHIVED";

export interface StockInput {
  quantity: number | null;
  quantitySold: number;
  quantityHeld: number;
}

export interface TicketTypeForSale extends StockInput {
  id: string;
  name: string;
  priceMinor: Minor;
  status: TicketTypeStatus;
  visibility: TicketVisibility;
  minPerOrder: number;
  maxPerOrder: number;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
  tiers: readonly PriceTierInput[];
}

export interface EventForSale {
  id: string;
  status: EventStatus;
  capacity: number | null;
  /** Vendus et réservés sur tous les tarifs. */
  soldTotal: number;
  heldTotal: number;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
  maxTicketsPerOrder: number;
  startsAt: Date;
}

export interface CartRequestLine {
  ticketTypeId: string;
  quantity: number;
}

export type CartError =
  | { code: "EVENT_NOT_ON_SALE" }
  | { code: "EVENT_SALES_NOT_STARTED" }
  | { code: "EVENT_SALES_ENDED" }
  | { code: "EMPTY_CART" }
  | { code: "INVALID_QUANTITY"; ticketTypeId: string }
  | { code: "UNKNOWN_TICKET_TYPE"; ticketTypeId: string }
  | { code: "TICKET_TYPE_UNAVAILABLE"; ticketTypeId: string }
  | { code: "SALES_NOT_STARTED"; ticketTypeId: string }
  | { code: "SALES_ENDED"; ticketTypeId: string }
  | { code: "BELOW_MIN"; ticketTypeId: string; min: number }
  | { code: "ABOVE_MAX"; ticketTypeId: string; max: number }
  | { code: "ORDER_LIMIT"; max: number }
  | { code: "NOT_ENOUGH_STOCK"; ticketTypeId: string; available: number }
  | { code: "EVENT_FULL"; available: number };

/** Places restantes (Infinity si illimité). */
export function remaining(stock: StockInput): number {
  if (stock.quantity == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, stock.quantity - stock.quantitySold - stock.quantityHeld);
}

/** RG-TKT-03 : disponibilité d'un tarif, dans la limite de la jauge de l'événement. */
export function availableFor(tt: StockInput, event: Pick<EventForSale, "capacity" | "soldTotal" | "heldTotal">): number {
  const eventLeft = event.capacity == null ? Number.POSITIVE_INFINITY : Math.max(0, event.capacity - event.soldTotal - event.heldTotal);
  return Math.min(remaining(tt), eventLeft);
}

function inWindow(now: Date, start?: Date | null, end?: Date | null): "BEFORE" | "OPEN" | "AFTER" {
  if (start && now.getTime() < start.getTime()) return "BEFORE";
  if (end && now.getTime() >= end.getTime()) return "AFTER";
  return "OPEN";
}

/**
 * Contrôles d'un panier avant réservation. Renvoie la liste des erreurs (vide si le panier est valide).
 * La réservation elle-même reste atomique en base (RG-BUY-01) : ce contrôle ne la remplace pas.
 */
export function checkCart(
  event: EventForSale,
  ticketTypes: readonly TicketTypeForSale[],
  lines: readonly CartRequestLine[],
  now: Date,
  options: { unlocksHidden?: boolean } = {},
): CartError[] {
  const errors: CartError[] = [];
  if (event.status !== "PUBLISHED") return [{ code: "EVENT_NOT_ON_SALE" }];
  const eventWindow = inWindow(now, event.salesStartAt, event.salesEndAt ?? event.startsAt);
  if (eventWindow === "BEFORE") return [{ code: "EVENT_SALES_NOT_STARTED" }];
  if (eventWindow === "AFTER") return [{ code: "EVENT_SALES_ENDED" }];

  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      errors.push({ code: "INVALID_QUANTITY", ticketTypeId: line.ticketTypeId });
      continue;
    }
    merged.set(line.ticketTypeId, (merged.get(line.ticketTypeId) ?? 0) + line.quantity);
  }
  if (merged.size === 0 && errors.length === 0) return [{ code: "EMPTY_CART" }];

  let total = 0;
  for (const [ticketTypeId, quantity] of merged) {
    total += quantity;
    const tt = ticketTypes.find((t) => t.id === ticketTypeId);
    if (!tt) {
      errors.push({ code: "UNKNOWN_TICKET_TYPE", ticketTypeId });
      continue;
    }
    const hidden = tt.visibility === "HIDDEN" || (tt.visibility === "CODE_ONLY" && !options.unlocksHidden);
    if (tt.status !== "ACTIVE" || hidden) {
      errors.push({ code: "TICKET_TYPE_UNAVAILABLE", ticketTypeId });
      continue;
    }
    const w = inWindow(now, tt.salesStartAt, tt.salesEndAt);
    if (w === "BEFORE") errors.push({ code: "SALES_NOT_STARTED", ticketTypeId });
    else if (w === "AFTER") errors.push({ code: "SALES_ENDED", ticketTypeId });
    if (quantity < tt.minPerOrder) errors.push({ code: "BELOW_MIN", ticketTypeId, min: tt.minPerOrder });
    if (quantity > tt.maxPerOrder) errors.push({ code: "ABOVE_MAX", ticketTypeId, max: tt.maxPerOrder });
    const available = remaining(tt);
    if (quantity > available) errors.push({ code: "NOT_ENOUGH_STOCK", ticketTypeId, available });
  }
  if (total > event.maxTicketsPerOrder) errors.push({ code: "ORDER_LIMIT", max: event.maxTicketsPerOrder });
  if (event.capacity != null) {
    const eventLeft = Math.max(0, event.capacity - event.soldTotal - event.heldTotal);
    if (total > eventLeft) errors.push({ code: "EVENT_FULL", available: eventLeft });
  }
  return errors;
}

export interface PricedLine {
  ticketTypeId: string;
  tierId: string | null;
  quantity: number;
  unitPriceMinor: Minor;
  unitDiscountMinor: Minor;
  unitPaidMinor: Minor;
  unitFeeMinor: Minor;
  lineTotalMinor: Minor;
  lineFeeMinor: Minor;
}

export interface PricedOrder {
  currency: string;
  lines: PricedLine[];
  subtotalMinor: Minor;
  discountMinor: Minor;
  totalMinor: Minor;
  applicationFeeMinor: Minor;
  ticketCount: number;
  isFree: boolean;
  feeSnapshot: FeeSnapshot;
}

/**
 * Chiffrage d'une commande (RG-BUY-03) : paliers, remise, commission par billet.
 * Le panier doit avoir été validé par `checkCart`.
 */
export function priceOrder(
  ticketTypes: readonly TicketTypeForSale[],
  lines: readonly CartRequestLine[],
  terms: FeeTerms,
  now: Date,
  options: { promo?: PromoInput | null; tiersEnabled?: boolean } = {},
): PricedOrder {
  const priced: PricedLine[] = [];
  for (const line of lines) {
    const tt = ticketTypes.find((t) => t.id === line.ticketTypeId);
    if (!tt) throw new CoreError("UNKNOWN_TICKET_TYPE", line.ticketTypeId);
    for (const alloc of allocateTiers(tt.priceMinor, tt.tiers, now, line.quantity, options.tiersEnabled ?? true)) {
      const promo = options.promo && promoAppliesTo(options.promo, tt.id) ? options.promo : null;
      const unitDiscountMinor = promo ? unitDiscount(alloc.priceMinor, promo) : 0;
      const unitPaidMinor = alloc.priceMinor - unitDiscountMinor;
      const unitFeeMinor = ticketCommission(unitPaidMinor, terms);
      priced.push({
        ticketTypeId: tt.id,
        tierId: alloc.tierId,
        quantity: alloc.quantity,
        unitPriceMinor: alloc.priceMinor,
        unitDiscountMinor,
        unitPaidMinor,
        unitFeeMinor,
        lineTotalMinor: unitPaidMinor * alloc.quantity,
        lineFeeMinor: unitFeeMinor * alloc.quantity,
      });
    }
  }
  const subtotalMinor = sum(priced.map((l) => l.unitPriceMinor * l.quantity));
  const discountMinor = sum(priced.map((l) => l.unitDiscountMinor * l.quantity));
  const totalMinor = subtotalMinor - discountMinor;
  return {
    currency: terms.currency,
    lines: priced,
    subtotalMinor,
    discountMinor,
    totalMinor,
    applicationFeeMinor: sum(priced.map((l) => l.lineFeeMinor)),
    ticketCount: sum(priced.map((l) => l.quantity)),
    isFree: totalMinor === 0,
    feeSnapshot: feeSnapshot(terms),
  };
}

/** Montant minimum d'un paiement accepté par Stripe, par devise (RG-BUY-05). Valeurs usuelles, à tenir à jour. */
export const STRIPE_MINIMUM_CHARGE: Readonly<Record<string, Minor>> = { EUR: 50, GBP: 30, CHF: 50, USD: 50, CAD: 50, AUD: 50, SEK: 300, DKK: 250, NOK: 300, PLN: 200 };

export function meetsMinimumCharge(totalMinor: Minor, currency: string): boolean {
  if (totalMinor === 0) return true;
  return totalMinor >= (STRIPE_MINIMUM_CHARGE[currency] ?? 50);
}
