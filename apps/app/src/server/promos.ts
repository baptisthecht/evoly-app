import "server-only";
import { CoreError, hasFeature, humanCode, normalizePromoCode, parseMajorToMinor, zonedLocalToUtc } from "@evoly/core";
import { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { exponentFor, findEvent } from "./events";

export interface PromoFormInput {
  code?: string | null;
  discountType: "PERCENT" | "AMOUNT" | "FREE";
  percent?: string | null;
  amount?: string | null;
  ticketTypeIds: string[];
  maxUses?: number | null;
  maxUsesPerEmail?: number | null;
  startsAtLocal?: string | null;
  expiresAtLocal?: string | null;
  unlocksHidden: boolean;
}

const CODE = /^[A-Z0-9_-]{3,32}$/;

/** US-PRM-01 : code saisi ou généré, pourcentage, montant fixe par billet ou gratuité. */
export async function createPromo(ctx: OrgContext, eventId: string, input: PromoFormInput) {
  if (!hasFeature(ctx.features, "PROMO_CODES")) throw new CoreError("FEATURE_UNAVAILABLE");
  const event = await findEvent(ctx, eventId);
  const code = input.code ? normalizePromoCode(input.code) : humanCode(8);
  if (!CODE.test(code)) throw new CoreError("PROMO_CODE_FORMAT");
  let percentOffBps: number | null = null;
  let amountOffMinor: number | null = null;
  if (input.discountType === "PERCENT") {
    percentOffBps = parseMajorToMinor(input.percent ?? "", 2); // « 10 » → 1000 points de base
    if (percentOffBps == null || percentOffBps < 1 || percentOffBps > 10_000) throw new CoreError("PROMO_PERCENT_INVALID");
  }
  if (input.discountType === "AMOUNT") {
    amountOffMinor = parseMajorToMinor(input.amount ?? "", exponentFor(event.currency));
    if (amountOffMinor == null || amountOffMinor < 1) throw new CoreError("PROMO_AMOUNT_INVALID");
  }
  const own = await db.ticketType.findMany({ where: { eventId, id: { in: input.ticketTypeIds } }, select: { id: true } });
  if (own.length !== input.ticketTypeIds.length) throw new CoreError("NOT_FOUND");
  const startsAt = input.startsAtLocal ? zonedLocalToUtc(input.startsAtLocal, event.timezone) : null;
  const expiresAt = input.expiresAtLocal ? zonedLocalToUtc(input.expiresAtLocal, event.timezone) : null;
  if (startsAt && expiresAt && expiresAt <= startsAt) throw new CoreError("PROMO_DATES_INVALID");
  try {
    const promo = await db.promoCode.create({
      data: { eventId, code, discountType: input.discountType, percentOffBps, amountOffMinor, ticketTypeIds: input.ticketTypeIds, maxUses: input.maxUses ?? null, maxUsesPerEmail: input.maxUsesPerEmail ?? null, startsAt, expiresAt, unlocksHidden: input.unlocksHidden },
    });
    await audit({ action: "promo.created", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "PromoCode", targetId: promo.id, metadata: { code } });
    return promo;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new CoreError("PROMO_CODE_TAKEN");
    throw err;
  }
}

export async function listPromos(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  return db.promoCode.findMany({ where: { eventId }, orderBy: { createdAt: "desc" } });
}

async function findPromo(eventId: string, promoId: string) {
  const promo = await db.promoCode.findFirst({ where: { id: promoId, eventId } });
  if (!promo) throw new CoreError("NOT_FOUND");
  return promo;
}

export async function setPromoActive(ctx: OrgContext, eventId: string, promoId: string, active: boolean) {
  await findEvent(ctx, eventId);
  const promo = await findPromo(eventId, promoId);
  await db.promoCode.update({ where: { id: promo.id }, data: { isActive: active } });
  await audit({ action: active ? "promo.activated" : "promo.deactivated", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "PromoCode", targetId: promo.id });
}

/** RG-PRM-04 : un code déjà utilisé ne peut pas être supprimé, seulement désactivé. */
export async function deletePromo(ctx: OrgContext, eventId: string, promoId: string) {
  await findEvent(ctx, eventId);
  const promo = await findPromo(eventId, promoId);
  if (promo.usedCount > 0 || (await db.order.count({ where: { promoCodeId: promo.id, status: "PENDING" } })) > 0) throw new CoreError("PROMO_USED");
  await db.promoCode.delete({ where: { id: promo.id } });
  await audit({ action: "promo.deleted", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "PromoCode", targetId: promo.id, metadata: { code: promo.code } });
}
