import { applyBps, type Bps, type Minor } from "./money";

export type DiscountType = "PERCENT" | "AMOUNT" | "FREE";

export interface PromoInput {
  id: string;
  eventId: string;
  code: string;
  discountType: DiscountType;
  percentOffBps?: Bps | null;
  amountOffMinor?: Minor | null;
  ticketTypeIds: readonly string[];
  maxUses?: number | null;
  maxUsesPerEmail?: number | null;
  usedCount: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive: boolean;
  unlocksHidden?: boolean;
}

export type PromoError = "NOT_FOUND" | "WRONG_EVENT" | "INACTIVE" | "NOT_STARTED" | "EXPIRED" | "EXHAUSTED" | "EMAIL_LIMIT" | "NOT_APPLICABLE";

export type PromoCheck = { ok: true } | { ok: false; error: PromoError };

export interface PromoContext {
  eventId: string;
  now: Date;
  /** Nombre de commandes payées de cet e-mail ayant déjà utilisé ce code. */
  usesByEmail: number;
  /** Tarifs présents dans le panier. */
  cartTicketTypeIds: readonly string[];
}

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Validation côté serveur d'un code promo (RG-PRM-01). */
export function validatePromo(promo: PromoInput | null | undefined, ctx: PromoContext): PromoCheck {
  if (!promo) return { ok: false, error: "NOT_FOUND" };
  if (promo.eventId !== ctx.eventId) return { ok: false, error: "WRONG_EVENT" };
  if (!promo.isActive) return { ok: false, error: "INACTIVE" };
  if (promo.startsAt && ctx.now.getTime() < promo.startsAt.getTime()) return { ok: false, error: "NOT_STARTED" };
  if (promo.expiresAt && ctx.now.getTime() >= promo.expiresAt.getTime()) return { ok: false, error: "EXPIRED" };
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return { ok: false, error: "EXHAUSTED" };
  if (promo.maxUsesPerEmail != null && ctx.usesByEmail >= promo.maxUsesPerEmail) return { ok: false, error: "EMAIL_LIMIT" };
  if (!ctx.cartTicketTypeIds.some((id) => promoAppliesTo(promo, id))) return { ok: false, error: "NOT_APPLICABLE" };
  return { ok: true };
}

export function promoAppliesTo(promo: PromoInput, ticketTypeId: string): boolean {
  return promo.ticketTypeIds.length === 0 || promo.ticketTypeIds.includes(ticketTypeId);
}

/** Remise sur un billet (RG-PRM-02) : jamais au-delà du prix. */
export function unitDiscount(priceMinor: Minor, promo: PromoInput): Minor {
  if (priceMinor <= 0) return 0;
  switch (promo.discountType) {
    case "FREE":
      return priceMinor;
    case "PERCENT":
      return Math.min(priceMinor, applyBps(priceMinor, promo.percentOffBps ?? 0));
    case "AMOUNT":
      return Math.min(priceMinor, promo.amountOffMinor ?? 0);
  }
}
