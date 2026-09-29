import "server-only";
import { canDeleteTicketType, canEditBasePrice, canEditTierPrice, canSetQuantity, CoreError, hasFeature, tierCalendarIssues, zonedLocalToUtc, type TierIssue } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { findEvent, parsePrice } from "./events";

export interface TicketTypeInput {
  name: string;
  description?: string | null;
  price: string;
  quantity?: number | null;
  minPerOrder: number;
  maxPerOrder: number;
  salesStartLocal?: string | null;
  salesEndLocal?: string | null;
  visibility: "VISIBLE" | "HIDDEN" | "CODE_ONLY";
  isNominative: boolean;
  requireHolderEmail?: boolean;
  resaleAllowed: boolean;
}

export interface TierInput {
  id?: string | null;
  name: string;
  price: string;
  startsAtLocal?: string | null;
  endsAtLocal?: string | null;
  quantityLimit?: number | null;
}

async function editableEvent(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  if (["CANCELLED", "ENDED", "ARCHIVED"].includes(event.status)) throw new CoreError("EVENT_LOCKED");
  return event;
}

/** RG-EVT-02 : un tarif payant ne peut pas être mis en vente sur un événement publié sans compte Stripe actif. */
function assertCanSell(ctx: OrgContext, event: { status: string }, priceMinor: number) {
  const live = event.status === "PUBLISHED" || event.status === "SALES_PAUSED";
  if (live && priceMinor > 0 && !ctx.stripe?.chargesEnabled) throw new CoreError("PUBLISH_STRIPE_REQUIRED");
}

async function findTicketType(eventId: string, ticketTypeId: string) {
  const tt = await db.ticketType.findFirst({ where: { id: ticketTypeId, eventId }, include: { priceTiers: true } });
  if (!tt) throw new CoreError("NOT_FOUND");
  return tt;
}

function window(input: Pick<TicketTypeInput, "salesStartLocal" | "salesEndLocal">, timeZone: string) {
  const salesStartAt = input.salesStartLocal ? zonedLocalToUtc(input.salesStartLocal, timeZone) : null;
  const salesEndAt = input.salesEndLocal ? zonedLocalToUtc(input.salesEndLocal, timeZone) : null;
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) throw new CoreError("SALES_END_BEFORE_START");
  return { salesStartAt, salesEndAt };
}

function limits(input: Pick<TicketTypeInput, "minPerOrder" | "maxPerOrder" | "quantity">) {
  if (input.minPerOrder < 1 || input.maxPerOrder < input.minPerOrder || input.maxPerOrder > 50) throw new CoreError("INVALID_ORDER_LIMITS");
  if (input.quantity != null && input.quantity < 1) throw new CoreError("INVALID_QUANTITY");
}

/** US-TKT-01 : nouveau tarif, placé à la fin de la liste. */
export async function createTicketType(ctx: OrgContext, eventId: string, input: TicketTypeInput) {
  const event = await editableEvent(ctx, eventId);
  limits(input);
  const priceMinor = parsePrice(input.price, event.currency);
  assertCanSell(ctx, event, priceMinor);
  const last = await db.ticketType.findFirst({ where: { eventId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const tt = await db.ticketType.create({
    data: {
      eventId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      priceMinor,
      currency: event.currency,
      quantity: input.quantity ?? null,
      minPerOrder: input.minPerOrder,
      maxPerOrder: input.maxPerOrder,
      ...window(input, event.timezone),
      visibility: input.visibility,
      isNominative: input.isNominative,
      requireHolderEmail: input.isNominative && !!input.requireHolderEmail, // RG-QST-01
      resaleAllowed: input.resaleAllowed,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  await audit({ action: "ticket_type.created", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "TicketType", targetId: tt.id });
  return tt;
}

/** RG-TKT-05 : prix figé après la première vente ; quantité jamais sous le vendu. */
export async function updateTicketType(ctx: OrgContext, eventId: string, ticketTypeId: string, input: TicketTypeInput) {
  const event = await editableEvent(ctx, eventId);
  const tt = await findTicketType(eventId, ticketTypeId);
  limits(input);
  const priceMinor = parsePrice(input.price, event.currency);
  if (priceMinor !== tt.priceMinor && !canEditBasePrice(tt)) throw new CoreError("PRICE_LOCKED");
  if (priceMinor !== tt.priceMinor) assertCanSell(ctx, event, priceMinor);
  if (!canSetQuantity(input.quantity ?? null, tt)) throw new CoreError("QUANTITY_BELOW_SOLD");
  const updated = await db.ticketType.update({
    where: { id: tt.id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      priceMinor,
      quantity: input.quantity ?? null,
      minPerOrder: input.minPerOrder,
      maxPerOrder: input.maxPerOrder,
      ...window(input, event.timezone),
      visibility: input.visibility,
      isNominative: input.isNominative,
      requireHolderEmail: input.isNominative && !!input.requireHolderEmail, // RG-QST-01
      resaleAllowed: input.resaleAllowed,
      ...(tt.status === "SOLD_OUT" && (input.quantity == null || input.quantity > tt.quantitySold + tt.quantityHeld) ? { status: "ACTIVE" as const } : {}),
    },
  });
  if (tt.resaleAllowed && !input.resaleAllowed) {
    const { cancelListingsForTicketType } = await import("./resale");
    await cancelListingsForTicketType(tt.id); // RG-RSL-09
  }
  await audit({ action: "ticket_type.updated", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "TicketType", targetId: tt.id });
  return updated;
}

/** RG-TKT-06 : suppression sans vente uniquement ; sinon masquer ou archiver. */
export async function deleteTicketType(ctx: OrgContext, eventId: string, ticketTypeId: string) {
  await editableEvent(ctx, eventId);
  const tt = await findTicketType(eventId, ticketTypeId);
  if (!canDeleteTicketType(tt)) throw new CoreError("TICKET_TYPE_HAS_SALES");
  await db.ticketType.delete({ where: { id: tt.id } });
  await audit({ action: "ticket_type.deleted", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "TicketType", targetId: tt.id, metadata: { name: tt.name } });
}

export async function setTicketTypeStatus(ctx: OrgContext, eventId: string, ticketTypeId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED") {
  await editableEvent(ctx, eventId);
  const tt = await findTicketType(eventId, ticketTypeId);
  await db.ticketType.update({ where: { id: tt.id }, data: { status } });
  await audit({ action: `ticket_type.${status.toLowerCase()}`, organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "TicketType", targetId: tt.id });
}

/** RG-TKT-04 : ordre d'affichage (monter ou descendre d'un cran). */
export async function moveTicketType(ctx: OrgContext, eventId: string, ticketTypeId: string, direction: "up" | "down") {
  await editableEvent(ctx, eventId);
  const list = await db.ticketType.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = list.findIndex((t) => t.id === ticketTypeId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  await db.$transaction(list.map((t, index) => db.ticketType.update({ where: { id: t.id }, data: { sortOrder: index } })));
}

/**
 * Paliers de prix d'un tarif (US-TKT-03, Pro). Remplace la liste en respectant RG-TKT-09 :
 * un palier ayant des ventes garde son prix et ne peut pas être supprimé.
 */
export async function saveTiers(ctx: OrgContext, eventId: string, ticketTypeId: string, tiers: TierInput[]): Promise<{ issues: TierIssue[] }> {
  if (!hasFeature(ctx.features, "DYNAMIC_PRICING")) throw new CoreError("PRO_REQUIRED");
  const event = await editableEvent(ctx, eventId);
  const tt = await findTicketType(eventId, ticketTypeId);
  if (tiers.length > 10) throw new CoreError("TOO_MANY_TIERS");
  const existing = new Map(tt.priceTiers.map((p) => [p.id, p]));
  const keptIds = new Set(tiers.map((t) => t.id).filter(Boolean) as string[]);
  for (const p of tt.priceTiers) if (!keptIds.has(p.id) && p.quantitySold + p.quantityHeld > 0) throw new CoreError("TIER_HAS_SALES");
  const rows = tiers.map((t, index) => {
    const priceMinor = parsePrice(t.price, event.currency);
    assertCanSell(ctx, event, priceMinor);
    const startsAt = t.startsAtLocal ? zonedLocalToUtc(t.startsAtLocal, event.timezone) : null;
    const endsAt = t.endsAtLocal ? zonedLocalToUtc(t.endsAtLocal, event.timezone) : null;
    if (startsAt && endsAt && endsAt <= startsAt) throw new CoreError("TIER_END_BEFORE_START");
    if (!startsAt && !endsAt && t.quantityLimit == null) throw new CoreError("TIER_NEEDS_LIMIT");
    const before = t.id ? existing.get(t.id) : undefined;
    if (t.id && !before) throw new CoreError("NOT_FOUND");
    if (before && priceMinor !== before.priceMinor && !canEditTierPrice(before)) throw new CoreError("TIER_PRICE_LOCKED");
    if (before && t.quantityLimit != null && t.quantityLimit < before.quantitySold + before.quantityHeld) throw new CoreError("QUANTITY_BELOW_SOLD");
    return { id: t.id ?? null, name: t.name.trim(), priceMinor, startsAt, endsAt, quantityLimit: t.quantityLimit ?? null, sortOrder: index };
  });
  await db.$transaction([
    db.priceTier.deleteMany({ where: { ticketTypeId, id: { notIn: [...keptIds] } } }),
    ...rows.map((r) =>
      r.id
        ? db.priceTier.update({ where: { id: r.id }, data: { name: r.name, priceMinor: r.priceMinor, startsAt: r.startsAt, endsAt: r.endsAt, quantityLimit: r.quantityLimit, sortOrder: r.sortOrder } })
        : db.priceTier.create({ data: { ticketTypeId, name: r.name, priceMinor: r.priceMinor, startsAt: r.startsAt, endsAt: r.endsAt, quantityLimit: r.quantityLimit, sortOrder: r.sortOrder } }),
    ),
  ]);
  await audit({ action: "ticket_type.tiers_saved", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "TicketType", targetId: ticketTypeId, metadata: { count: rows.length } });
  const saved = await db.priceTier.findMany({ where: { ticketTypeId } });
  return { issues: tierCalendarIssues(saved) };
}
