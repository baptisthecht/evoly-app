import "server-only";
import { CoreError, effectivePlan, hasFeature, normalizeShortCode, optionCommission, parseMajorToMinor, type FeeTerms } from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { exponentFor, findEvent } from "./events";
import { getPlans } from "./plans";

/**
 * Options et consommations prépayées (section 9.29, Pro) : jetons boisson, vestiaire, t-shirt…
 * Des articles vendus avec le billet et retirés au bar sur un scan, jamais un solde d'argent (RG-OPT-02).
 */
export type OptionFormInput = { name: string; description?: string; price: string; stock?: string; maxPerOrder?: string };
export type RequestedOption = { optionId: string; quantity: number };
export type PricedOptions = {
  lines: Array<{ optionId: string; name: string; quantity: number; unitPriceMinor: number; unitFeeMinor: number }>;
  subtotalMinor: number;
  feeMinor: number;
};
export const NO_OPTIONS: PricedOptions = { lines: [], subtotalMinor: 0, feeMinor: 0 };

/** Commandes dont les options comptent dans le stock : payées, ou réservées et pas encore expirées. */
const counting = (now: Date): Prisma.OrderWhereInput => ({
  OR: [{ status: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, { status: "PENDING", holdExpiresAt: { gt: now } }],
});

function parse(input: OptionFormInput, currency: string) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new CoreError("OPTION_NAME_REQUIRED");
  const priceMinor = parseMajorToMinor(input.price.trim(), exponentFor(currency));
  if (priceMinor == null || priceMinor < 0) throw new CoreError("OPTION_PRICE_INVALID");
  const stock = input.stock?.trim() ? Number(input.stock) : null;
  if (stock != null && (!Number.isInteger(stock) || stock < 0)) throw new CoreError("OPTION_STOCK_INVALID");
  const maxPerOrder = input.maxPerOrder?.trim() ? Number(input.maxPerOrder) : 10;
  if (!Number.isInteger(maxPerOrder) || maxPerOrder < 1 || maxPerOrder > 100) throw new CoreError("OPTION_MAX_INVALID");
  return { name, description: input.description?.trim().slice(0, 300) || null, priceMinor, stock, maxPerOrder };
}

export async function createOption(ctx: OrgContext, eventId: string, input: OptionFormInput) {
  if (!hasFeature(ctx.features, "PREPAID_OPTIONS")) throw new CoreError("FEATURE_UNAVAILABLE");
  const event = await findEvent(ctx, eventId);
  const data = parse(input, event.currency);
  const sortOrder = await db.eventOption.count({ where: { eventId } });
  const option = await db.eventOption.create({ data: { eventId, ...data, sortOrder } });
  await audit({ action: "option.created", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "EventOption", targetId: option.id });
  return option;
}

export async function updateOption(ctx: OrgContext, eventId: string, optionId: string, input: OptionFormInput) {
  if (!hasFeature(ctx.features, "PREPAID_OPTIONS")) throw new CoreError("FEATURE_UNAVAILABLE");
  const event = await findEvent(ctx, eventId);
  const data = parse(input, event.currency);
  const res = await db.eventOption.updateMany({ where: { id: optionId, eventId }, data });
  if (res.count === 0) throw new CoreError("NOT_FOUND");
  await audit({ action: "option.updated", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "EventOption", targetId: optionId });
}

/** Activer ou retirer de la vente ; les options déjà vendues restent retirables au bar (RG-OPT-09). */
export async function setOptionActive(ctx: OrgContext, eventId: string, optionId: string, active: boolean) {
  await findEvent(ctx, eventId);
  const res = await db.eventOption.updateMany({ where: { id: optionId, eventId }, data: { active } });
  if (res.count === 0) throw new CoreError("NOT_FOUND");
  await audit({
    action: active ? "option.activated" : "option.deactivated",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "EventOption",
    targetId: optionId,
  });
}

/** Options de l'événement, avec les quantités vendues et retirées (RG-OPT-08). */
export async function listOptions(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  const options = await db.eventOption.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const sums = await db.orderOption.groupBy({
    by: ["optionId"],
    where: { optionId: { in: options.map((o) => o.id) }, order: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } },
    _sum: { quantity: true, redeemed: true },
  });
  return options.map((o) => {
    const s = sums.find((x) => x.optionId === o.id)?._sum;
    return { ...o, sold: s?.quantity ?? 0, redeemed: s?.redeemed ?? 0 };
  });
}

/** Options proposées sur la page de vente : actives, seulement si l'organisation a l'offre Pro. */
export async function publicOptions(eventId: string, features: readonly string[], now = new Date()) {
  if (!features.includes("PREPAID_OPTIONS")) return [];
  const options = await db.eventOption.findMany({ where: { eventId, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const used = await db.orderOption.groupBy({
    by: ["optionId"],
    where: { optionId: { in: options.map((o) => o.id) }, order: counting(now) },
    _sum: { quantity: true },
  });
  return options.map((o) => {
    const left = o.stock == null ? null : Math.max(0, o.stock - (used.find((u) => u.optionId === o.id)?._sum.quantity ?? 0));
    return { id: o.id, name: o.name, description: o.description, priceMinor: o.priceMinor, maxPerOrder: o.maxPerOrder, left };
  });
}

/** Options en vente pour un événement, d'après l'offre de son organisateur (page de vente et aperçu). */
export async function saleOptions(eventId: string, now = new Date()) {
  const ev = await db.event.findUnique({
    where: { id: eventId },
    select: { organization: { select: { subscription: { select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } } } } },
  });
  if (!ev) return [];
  const plans = await getPlans();
  return publicOptions(eventId, plans[effectivePlan(ev.organization.subscription, now)].features, now);
}

/**
 * Dans la transaction de réservation, l'événement verrouillé : options demandées, prix, commission et stock.
 * Le stock compte les commandes payées et les réservations en cours : une réservation abandonnée libère ses options d'elle-même.
 */
export async function priceOptionsInTx(
  tx: Prisma.TransactionClient,
  eventId: string,
  requested: RequestedOption[],
  terms: FeeTerms,
  now: Date,
  allowed: boolean,
): Promise<PricedOptions> {
  const wanted = new Map<string, number>();
  for (const r of requested) {
    if (!Number.isInteger(r.quantity) || r.quantity < 0 || r.quantity > 100) throw new CoreError("OPTION_QUANTITY_INVALID");
    if (r.quantity > 0) wanted.set(r.optionId, (wanted.get(r.optionId) ?? 0) + r.quantity);
  }
  if (wanted.size === 0) return NO_OPTIONS;
  if (!allowed) throw new CoreError("FEATURE_UNAVAILABLE");
  const options = await tx.eventOption.findMany({ where: { id: { in: [...wanted.keys()] }, eventId, active: true } });
  if (options.length !== wanted.size) throw new CoreError("OPTION_UNAVAILABLE");
  const lines: PricedOptions["lines"] = [];
  for (const o of options) {
    const quantity = wanted.get(o.id)!;
    if (quantity > o.maxPerOrder) throw new CoreError("OPTION_MAX_EXCEEDED");
    if (o.stock != null) {
      const used = await tx.orderOption.aggregate({ where: { optionId: o.id, order: counting(now) }, _sum: { quantity: true } });
      if ((used._sum.quantity ?? 0) + quantity > o.stock) throw new CoreError("OPTION_SOLD_OUT");
    }
    lines.push({ optionId: o.id, name: o.name, quantity, unitPriceMinor: o.priceMinor, unitFeeMinor: optionCommission(o.priceMinor, terms) });
  }
  return {
    lines,
    subtotalMinor: lines.reduce((t, l) => t + l.unitPriceMinor * l.quantity, 0),
    feeMinor: lines.reduce((t, l) => t + l.unitFeeMinor * l.quantity, 0),
  };
}

/** Au bar : ce qui reste à retirer sur la commande d'un billet de l'événement (RG-OPT-04). */
export async function optionsForTicket(eventId: string, ticketId: string) {
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, eventId }, select: { orderId: true } });
  if (!ticket) throw new CoreError("NOT_FOUND");
  const lines = await db.orderOption.findMany({
    where: { orderId: ticket.orderId, order: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } },
    include: { option: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return lines.map((l) => ({
    id: l.id,
    name: l.option.name,
    quantity: l.quantity,
    redeemed: l.redeemed,
    refunded: l.refunded,
    left: l.quantity - l.redeemed - l.refunded,
  }));
}

/** Au bar, à partir du QR code ou du code court scanné, avec les mêmes règles qu'à l'entrée : un billet de cet événement seulement. */
export async function optionsForScan(eventId: string, input: { code?: string; shortCode?: string }) {
  const select = { id: true, eventId: true, holderFirstName: true, holderLastName: true } as const;
  const ticket = input.code
    ? await db.ticket.findUnique({ where: { code: input.code.trim() }, select })
    : input.shortCode
      ? await db.ticket.findUnique({ where: { eventId_shortCode: { eventId, shortCode: normalizeShortCode(input.shortCode) } }, select })
      : null;
  if (!ticket || ticket.eventId !== eventId) throw new CoreError("NOT_FOUND");
  const holder = [ticket.holderFirstName, ticket.holderLastName].filter(Boolean).join(" ") || null;
  return { holder, options: await optionsForTicket(eventId, ticket.id) };
}

/** Retrait au bar, atomique : jamais au-delà de ce qui a été acheté, même avec deux téléphones à la fois ; chaque retrait est journalisé. */
export async function redeemOption(eventId: string, orderOptionId: string, quantity: number, by: { deviceId?: string | null; staffName?: string | null } = {}) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new CoreError("OPTION_QUANTITY_INVALID");
  return db.$transaction(async (tx) => {
    const done = await tx.$executeRaw`
      UPDATE "OrderOption" AS l SET "redeemed" = l."redeemed" + ${quantity}
      FROM "Order" AS o
      WHERE l."id" = ${orderOptionId} AND o."id" = l."orderId" AND o."eventId" = ${eventId}
        AND o."status" IN ('PAID', 'PARTIALLY_REFUNDED') AND l."redeemed" + l."refunded" + ${quantity} <= l."quantity"`;
    if (done !== 1) throw new CoreError("OPTION_NOT_REDEEMABLE");
    await tx.optionRedemption.create({ data: { orderOptionId, quantity, deviceId: by.deviceId ?? null, staffName: by.staffName?.slice(0, 80) ?? null } });
    const line = await tx.orderOption.findUniqueOrThrow({ where: { id: orderOptionId }, select: { quantity: true, redeemed: true, refunded: true } });
    return { left: line.quantity - line.redeemed - line.refunded };
  });
}

/** RG-OPT-07 : les options non retirées restent remboursables après le début de l'événement, si l'organisateur le décide. */
export async function setOptionsRefundAfterStart(ctx: OrgContext, eventId: string, allowed: boolean) {
  if (!hasFeature(ctx.features, "PREPAID_OPTIONS")) throw new CoreError("FEATURE_UNAVAILABLE");
  await findEvent(ctx, eventId);
  await db.event.update({ where: { id: eventId }, data: { optionsRefundAfterStart: allowed } });
}
