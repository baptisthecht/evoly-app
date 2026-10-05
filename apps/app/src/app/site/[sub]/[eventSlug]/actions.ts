"use server";

import { CoreError, normalizePromoCode, validatePromo } from "@evoly/core";
import { friendSeats } from "@/server/seating";
import { db } from "@/lib/db";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import {
  CartRejected,
  PromoRejected,
  cancelReservation,
  reserveOrder,
  submitBuyer,
  updateTicketHolder,
  type PublicQuestion,
  type SubmitResult,
  changeReservationSeats,
  reservationSeats,
} from "@/server/checkout";
import { sendTicketsLookup } from "@/server/orders";
import { createListing, reserveResale, withdrawListing } from "@/server/resale";
import { requestRefund } from "@/server/refunds";
import { hasEventAccess, unlockEvent } from "@/server/questions";
import { getPublicOrganization, loadPublicEvent, type PublicTicketType } from "@/server/publicEvents";
import { hit } from "@/server/rateLimit";
import { clientIp } from "@/server/requestInfo";

export interface ReservationView {
  token: string;
  reference: string;
  expiresAt: string;
  currency: string;
  totalMinor: number;
  isFree: boolean;
  discountMinor: number;
  promoCode: string | null;
  lines: Array<{
    orderItemId: string;
    ticketTypeId: string;
    name: string;
    tierName: string | null;
    quantity: number;
    unitPriceMinor: number;
    nominative: boolean;
    holderEmail?: boolean;
  }>;
  stripeAccountId: string | null;
  /** US-QST-01 : questions de la commande et de chaque ligne. */
  questions: { order: Array<PublicQuestion>; perLine: Record<string, Array<PublicQuestion>> };
  seats?: Array<{ id: string; row: string; label: string }>;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string; ticketTypeId?: string };

const linesSchema = z
  .array(z.object({ ticketTypeId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(50) }))
  .min(1)
  .max(20);
const buyerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.email().max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  marketingOptIn: z.boolean(),
  holders: z
    .record(
      z.string(),
      z
        .array(z.object({ firstName: z.string().trim().max(60), lastName: z.string().trim().max(60), email: z.string().trim().max(200).nullable().optional() }))
        .max(50),
    )
    .optional(),
  answers: z
    .object({
      order: z.record(z.string(), z.unknown()).optional(),
      tickets: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(50)).optional(),
    })
    .optional(),
});

function failure(err: unknown): { ok: false; error: string; ticketTypeId?: string } {
  if (err instanceof CartRejected) {
    const first = err.errors[0]!;
    return { ok: false, error: `CART_${first.code}`, ticketTypeId: "ticketTypeId" in first ? first.ticketTypeId : undefined };
  }
  if (err instanceof PromoRejected) return { ok: false, error: `PROMO_${err.reason}` };
  if (err instanceof CoreError) return { ok: false, error: err.code };
  console.error(err);
  return { ok: false, error: "UNKNOWN" };
}

/** « Continuer » : réservation des places (RG-BUY-01), limitée par adresse IP (RG-BUY-10). */
export async function reserveAction(
  eventId: string,
  lines: unknown,
  promoCode?: string | null,
  seatIds?: unknown,
  nearCode?: string | null,
): Promise<Result<ReservationView>> {
  const parsed = linesSchema.safeParse(lines);
  if (!parsed.success) return { ok: false, error: "CART_EMPTY_CART" };
  if ((await hit(`checkout:reserve:${await clientIp()}`, 600)) > 30) return { ok: false, error: "RATE_LIMITED" };
  try {
    // RG-PUB-06 : sans le code d'accès, pas de réservation pour un événement privé
    const target = await db.event.findUnique({ where: { id: eventId }, select: { id: true, visibility: true, accessCodeHash: true } });
    if (!target || !(await hasEventAccess(target))) return { ok: false, error: "ACCESS_REQUIRED" };
    const seats =
      Array.isArray(seatIds) && seatIds.length <= 50 && seatIds.every((x) => typeof x === "string" && x.length <= 40) ? (seatIds as string[]) : null;
    const r = await reserveOrder({
      eventId,
      lines: parsed.data,
      locale: await getLocale(),
      promoCode: promoCode?.slice(0, 40) || null,
      seatIds: seats,
      nearCode: typeof nearCode === "string" ? nearCode.slice(0, 16) : null,
    });
    const held = await reservationSeats(r.orderId);
    return {
      ok: true,
      data: {
        token: r.token,
        reference: r.reference,
        expiresAt: r.expiresAt.toISOString(),
        currency: r.currency,
        totalMinor: r.totalMinor,
        isFree: r.isFree,
        discountMinor: r.discountMinor,
        promoCode: r.promoCode,
        lines: r.lines,
        questions: r.questions,
        stripeAccountId: r.stripeAccountId,
        seats: held,
      },
    };
  } catch (err) {
    return failure(err);
  }
}

export async function submitBuyerAction(token: string, buyer: unknown): Promise<Result<SubmitResult>> {
  const parsed = buyerSchema.safeParse(buyer);
  if (!parsed.success) return { ok: false, error: "INVALID_BUYER" };
  if ((await hit(`checkout:submit:${token.slice(0, 16)}`, 600)) > 15) return { ok: false, error: "RATE_LIMITED" };
  try {
    return { ok: true, data: await submitBuyer(token, parsed.data) };
  } catch (err) {
    return failure(err);
  }
}

export async function cancelReservationAction(token: string): Promise<void> {
  await cancelReservation(token).catch(() => undefined);
}

export interface PromoPreview {
  code: string;
  discountType: "PERCENT" | "AMOUNT" | "FREE";
  percentOffBps: number | null;
  amountOffMinor: number | null;
  ticketTypeIds: string[];
  unlocked: Array<Omit<PublicTicketType, "next"> & { next: { priceMinor: number; startsAt: string } | null }>;
}

/** Aperçu d'un code avant la réservation (la validation qui compte reste celle de la réservation, RG-PRM-01). */
export async function previewPromoAction(eventId: string, code: string): Promise<Result<PromoPreview>> {
  if ((await hit(`checkout:promo:${await clientIp()}`, 600)) > 40) return { ok: false, error: "RATE_LIMITED" };
  const normalized = normalizePromoCode(code).slice(0, 40);
  const row = normalized ? await db.promoCode.findUnique({ where: { eventId_code: { eventId, code: normalized } } }) : null;
  const all = await db.ticketType.findMany({ where: { eventId }, select: { id: true } });
  const check = validatePromo(row, { eventId, now: new Date(), usesByEmail: 0, cartTicketTypeIds: all.map((t) => t.id) });
  if (!check.ok || !row) return { ok: false, error: `PROMO_${check.ok ? "NOT_FOUND" : check.error}` };
  const hidden = row.unlocksHidden ? await loadPublicEvent({ id: eventId }, { codeOnly: true }) : null;
  const unlocked = (hidden?.ticketTypes ?? []).filter((t) => row.ticketTypeIds.length === 0 || row.ticketTypeIds.includes(t.id));
  return {
    ok: true,
    data: {
      code: row.code,
      discountType: row.discountType,
      percentOffBps: row.percentOffBps,
      amountOffMinor: row.amountOffMinor,
      ticketTypeIds: row.ticketTypeIds,
      unlocked: unlocked.map((t) => ({ ...t, next: t.next ? { priceMinor: t.next.priceMinor, startsAt: t.next.startsAt.toISOString() } : null })),
    },
  };
}

const holderSchema = z.object({ firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60) });

export async function updateHolderAction(token: string, ticketId: string, holder: unknown): Promise<Result<null>> {
  const parsed = holderSchema.safeParse(holder);
  if (!parsed.success) return { ok: false, error: "INVALID_BUYER" };
  if ((await hit(`tickets:holder:${token.slice(0, 16)}`, 3600)) > 30) return { ok: false, error: "RATE_LIMITED" };
  try {
    await updateTicketHolder(token, ticketId, parsed.data);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err);
  }
}

/** RG-POST-02 : même réponse que l'adresse existe ou non, 3 demandes par heure et par adresse. */
export async function lookupTicketsAction(sub: string, email: unknown): Promise<Result<null>> {
  const parsed = z
    .email()
    .max(200)
    .safeParse(typeof email === "string" ? email.trim().toLowerCase() : email);
  if (!parsed.success) return { ok: false, error: "INVALID_EMAIL" };
  const ipCount = await hit(`tickets:lookup:ip:${await clientIp()}`, 3600);
  const emailCount = await hit(`tickets:lookup:email:${parsed.data}`, 3600);
  const org = await getPublicOrganization(sub);
  if (org && ipCount <= 20 && emailCount <= 3)
    await sendTicketsLookup(org.id, parsed.data, (await getLocale()) === "en" ? "en" : "fr").catch((err) => console.error("lookup", err));
  return { ok: true, data: null };
}

/** Revente : réservation d'une annonce pendant la durée de réservation de l'événement (section 9.13). */
export async function reserveResaleAction(linkCode: string): Promise<Result<ReservationView>> {
  if ((await hit(`resale:reserve:${await clientIp()}`, 600)) > 20) return { ok: false, error: "RATE_LIMITED" };
  try {
    const r = await reserveResale(linkCode.slice(0, 40), await getLocale());
    return {
      ok: true,
      data: {
        token: r.token,
        reference: r.reference,
        expiresAt: r.expiresAt.toISOString(),
        currency: r.currency,
        totalMinor: r.totalMinor,
        isFree: r.isFree,
        discountMinor: 0,
        promoCode: null,
        lines: r.lines,
        questions: r.questions,
        stripeAccountId: r.stripeAccountId,
      },
    };
  } catch (err) {
    return failure(err);
  }
}

export async function createListingAction(token: string, ticketId: string, price: string): Promise<Result<null>> {
  if ((await hit(`resale:list:${token.slice(0, 16)}`, 3600)) > 20) return { ok: false, error: "RATE_LIMITED" };
  try {
    await createListing(token, ticketId, String(price).slice(0, 12));
    return { ok: true, data: null };
  } catch (err) {
    return failure(err);
  }
}

export async function withdrawListingAction(token: string, listingId: string): Promise<Result<null>> {
  try {
    await withdrawListing(token, listingId);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err);
  }
}

/** US-REF-01 : demande de remboursement depuis la page des billets. */
export async function requestRefundAction(token: string, ticketIds: unknown, message: unknown): Promise<Result<{ automatic: boolean }>> {
  const ids = z.array(z.string().max(40)).min(1).max(50).safeParse(ticketIds);
  if (!ids.success) return { ok: false, error: "REFUND_NO_TICKET" };
  if ((await hit(`refund:request:${token.slice(0, 16)}`, 3600)) > 10) return { ok: false, error: "RATE_LIMITED" };
  try {
    const r = await requestRefund(token, ids.data, typeof message === "string" ? message : null);
    return { ok: true, data: { automatic: r.automatic } };
  } catch (err) {
    return failure(err);
  }
}

/** RG-PUB-06 : saisie du code d'accès d'un événement privé, tentatives limitées. */
export async function unlockEventAction(eventId: string, code: unknown): Promise<Result<null>> {
  if (typeof code !== "string" || code.length > 60) return { ok: false, error: "ACCESS_CODE_WRONG" };
  if ((await hit(`access:${eventId.slice(0, 30)}`, 900)) > 30) return { ok: false, error: "RATE_LIMITED" };
  return (await unlockEvent(eventId, code)) ? { ok: true, data: null } : { ok: false, error: "ACCESS_CODE_WRONG" };
}

/** Section 9.9 : places de l'ami qui a partagé son lien (prénom seulement), pour proposer les places les plus proches. */
export async function friendSeatsAction(
  eventId: string,
  code: string,
): Promise<{ firstName: string; seatIds: string[]; center: { x: number; y: number } } | null> {
  if (typeof eventId !== "string" || typeof code !== "string" || code.length > 16) return null;
  if ((await hit(`friends:${await clientIp()}`, 600)) > 60) return null;
  return friendSeats(eventId, code);
}

/** Section 9.9 : changer ses places pendant la réservation (même commande, même temps restant). */
export async function changeSeatsAction(token: string, seatIds: unknown): Promise<Result<Array<{ id: string; row: string; label: string }>>> {
  if (typeof token !== "string" || !Array.isArray(seatIds) || seatIds.length > 50 || !seatIds.every((x) => typeof x === "string" && x.length <= 40))
    return { ok: false, error: "SEATS_MISMATCH" };
  if ((await hit(`checkout:seats:${await clientIp()}`, 600)) > 60) return { ok: false, error: "RATE_LIMITED" };
  try {
    return { ok: true, data: await changeReservationSeats(token, seatIds as string[]) };
  } catch (err) {
    return failure(err);
  }
}
