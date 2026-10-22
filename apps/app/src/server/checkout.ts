import "server-only";
import { publicQuestions } from "./questions";
import { friendSeats, holdSeats, markSeatsSold, releaseSeats, seatsForTickets } from "./seating";
import { createHmac } from "node:crypto";
import {
  checkCart,
  CoreError,
  effectivePlan,
  humanCode,
  meetsMinimumCharge,
  normalizePromoCode,
  orderReference,
  priceOrder,
  secretToken,
  sha256Hex,
  ticketShortCode,
  type CartError,
  type CartRequestLine,
  type PromoError,
  type PromoInput,
  type TicketTypeForSale,
  validatePromo,
  answerFor,
  questionsForOrder,
} from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { getPlans } from "./plans";
import { salesOpeningAt } from "@evoly/core";
import { presaleCodeFor } from "./presale";
import { hasFeature, ticketCommission } from "@evoly/core";
import { latePaymentRefundEmail } from "./email/templates";
import { emailBrandFor } from "./email/brand";
import { sendEmail } from "./email/send";
import { safeError } from "@/lib/redact";
import { formatMoney, toLocale } from "@evoly/i18n";
import { NO_OPTIONS, priceOptionsInTx, type RequestedOption } from "./options";
import { blockedForPublic, validOffer } from "./waitlist";
import { resolveAmbassadorInTx } from "./ambassadors";
import { PLAN_SUBSCRIPTION_SELECT } from "@/server/planSelect";

type Tx = Prisma.TransactionClient;

export const BUYER_TERMS_VERSION = "2026-09";
export const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

/** Panier refusé : erreurs détaillées par tarif (quantités, stock, fenêtre de vente…). */
export class CartRejected extends Error {
  constructor(public readonly errors: CartError[]) {
    super("CART_REJECTED");
  }
}

/** Code promo refusé (RG-PRM-01) : inconnu, inactif, hors dates, épuisé, limite par e-mail, tarifs non concernés. */
export class PromoRejected extends Error {
  constructor(public readonly reason: PromoError) {
    super(`PROMO_${reason}`);
  }
}

/**
 * Lien magique d'une commande (RG-POST-01), dérivé d'un secret serveur : recalculable pour l'e-mail
 * et la page de confirmation, sans stocker autre chose que son hachage. Changer la version l'invalide.
 */
export function orderAccessToken(orderId: string, version: number): string {
  const e = env();
  return createHmac("sha256", e.ORDER_TOKEN_SECRET ?? e.BETTER_AUTH_SECRET)
    .update(`evoly-order:${orderId}:${version}`)
    .digest("base64url");
}

export async function findOrderIdByToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const order = await db.order.findUnique({ where: { accessTokenHash: await sha256Hex(token) }, select: { id: true } });
  return order?.id ?? null;
}

export async function lockEvent(tx: Tx, eventId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Event" WHERE id = ${eventId} AND "deletedAt" IS NULL FOR UPDATE`;
  return rows.length === 1;
}

async function releaseItems(tx: Tx, items: Array<{ ticketTypeId: string; priceTierId: string | null; quantity: number }>) {
  for (const it of items) {
    await tx.$executeRaw`UPDATE "TicketType" SET "quantityHeld" = "quantityHeld" - ${it.quantity} WHERE id = ${it.ticketTypeId}`;
    if (it.priceTierId) await tx.$executeRaw`UPDATE "PriceTier" SET "quantityHeld" = "quantityHeld" - ${it.quantity} WHERE id = ${it.priceTierId}`;
  }
}

/** RG-BUY-02 : libère les réservations expirées d'un événement dont la ligne est déjà verrouillée. */
async function releaseExpiredInTx(tx: Tx, eventId: string, now: Date) {
  const expired = await tx.order.findMany({ where: { eventId, status: "PENDING", holdExpiresAt: { lt: now } }, include: { items: true } });
  for (const o of expired) {
    if (o.source === "RESALE") {
      if (o.resaleListingId)
        await tx.resaleListing.updateMany({ where: { id: o.resaleListingId, status: "RESERVED" }, data: { status: "ACTIVE", reservedUntil: null } });
    } else {
      await releaseItems(tx, o.items);
      await releaseSeats(tx, o.id);
    }
    await tx.order.update({ where: { id: o.id }, data: { status: "EXPIRED" } });
  }
  return expired.map((o) => ({ id: o.id, paymentIntentId: o.stripePaymentIntentId }));
}

/** Annule les intentions de paiement des réservations libérées, pour éviter un paiement tardif. */
async function cancelPaymentIntents(organizationId: string, intents: Array<{ paymentIntentId: string | null }>) {
  const s = stripe();
  const ids = intents.map((i) => i.paymentIntentId).filter((x): x is string => !!x);
  if (!s || ids.length === 0) return;
  const account = await db.stripeAccount.findUnique({ where: { organizationId }, select: { stripeAccountId: true } });
  if (!account) return;
  await Promise.all(ids.map((id) => s.paymentIntents.cancel(id, {}, { stripeAccount: account.stripeAccountId }).catch(() => null)));
}

/** Tâche planifiée : libère toutes les réservations expirées, événement par événement. */
export async function releaseExpiredHolds(now = new Date()): Promise<number> {
  const events = await db.order.findMany({
    where: { status: "PENDING", holdExpiresAt: { lt: now } },
    select: { eventId: true, organizationId: true },
    distinct: ["eventId"],
  });
  let count = 0;
  for (const e of events) {
    const released = await db.$transaction(async (tx) => ((await lockEvent(tx, e.eventId)) ? releaseExpiredInTx(tx, e.eventId, now) : []), TX_OPTIONS);
    count += released.length;
    await cancelPaymentIntents(e.organizationId, released);
  }
  return count;
}

export interface Reservation {
  orderId: string;
  token: string;
  reference: string;
  expiresAt: Date;
  currency: string;
  totalMinor: number;
  isFree: boolean;
  discountMinor: number;
  promoCode: string | null;
  options?: Array<{ optionId: string; name: string; quantity: number; unitPriceMinor: number }>;
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
  /** US-QST-01 : questions posées pour cette commande (par commande, et par billet pour chaque ligne). */
  questions: { order: PublicQuestion[]; perLine: Record<string, PublicQuestion[]> };
  stripeAccountId: string | null;
}

/**
 * RG-BUY-01 : réservation atomique. La ligne de l'événement est verrouillée (jauge commune),
 * puis chaque incrément est conditionnel : la survente est impossible, même sous forte concurrence.
 */
export async function reserveOrder(
  input: {
    eventId: string;
    lines: CartRequestLine[];
    locale: string;
    promoCode?: string | null;
    presaleCode?: string | null;
    seatIds?: string[] | null;
    nearCode?: string | null;
    options?: RequestedOption[] | null; // options et consommations prépayées (section 9.29, Pro)
    waitlistToken?: string | null; // lien personnel d'un inscrit à la liste d'attente (section 9.30)
    ambassadorCode?: string | null; // lien d'ambassadeur suivi par l'acheteur (section 9.28, Pro)
  },
  now = new Date(),
): Promise<Reservation> {
  const orderId = `c${humanCode(24, ID_ALPHABET)}`;
  const token = orderAccessToken(orderId, 1);
  const accessTokenHash = await sha256Hex(token);
  const plans = await getPlans();
  // section 9.24 : organisation suspendue par Evoly, ventes interrompues
  const owner = await db.event.findUnique({ where: { id: input.eventId }, select: { organization: { select: { status: true } } } });
  if (owner && owner.organization.status !== "ACTIVE") throw new CoreError("SALES_SUSPENDED");
  const { order, event, released, names } = await db.$transaction(async (tx) => {
    if (!(await lockEvent(tx, input.eventId))) throw new CoreError("NOT_FOUND");
    const released = await releaseExpiredInTx(tx, input.eventId, now);
    const event = await tx.event.findUniqueOrThrow({
      where: { id: input.eventId },
      include: {
        ticketTypes: { include: { priceTiers: true } },
        organization: { select: { subscription: { select: PLAN_SUBSCRIPTION_SELECT } } },
      },
    });
    const types: TicketTypeForSale[] = event.ticketTypes.map((t) => ({ ...t, tiers: t.priceTiers }));
    // section 9.28 : commande attribuée à l'ambassadeur du lien, si l'organisation a l'offre Pro ; un code inconnu est ignoré
    let ambassadorId =
      input.ambassadorCode && hasFeature(plans[effectivePlan(event.organization.subscription, now)].features, "AMBASSADORS")
        ? await resolveAmbassadorInTx(tx, event.id, input.ambassadorCode)
        : null;
    // section 9.30 : tant que des inscrits attendent, le tarif reste complet pour le public, sauf pour l'inscrit qui achète avec son offre
    const offer = input.waitlistToken ? await validOffer(tx, input.waitlistToken, event.id, now) : null;
    const blocked = await blockedForPublic(
      tx,
      input.lines.map((l) => l.ticketTypeId),
      now,
    );
    for (const l of input.lines) {
      if (blocked.has(l.ticketTypeId) && l.ticketTypeId !== offer?.ticketTypeId)
        throw new CartRejected([{ code: "NOT_ENOUGH_STOCK", ticketTypeId: l.ticketTypeId, available: 0 }]);
    }
    if (offer) {
      const asked = input.lines.filter((l) => l.ticketTypeId === offer.ticketTypeId).reduce((n, l) => n + l.quantity, 0);
      const allowed = offer.offeredQuantity ?? offer.quantity;
      if (asked > allowed) throw new CartRejected([{ code: "NOT_ENOUGH_STOCK", ticketTypeId: offer.ticketTypeId, available: allowed }]);
    }
    let promo: PromoInput | null = null;
    if (input.promoCode) {
      const row = await tx.promoCode.findUnique({ where: { eventId_code: { eventId: event.id, code: normalizePromoCode(input.promoCode) } } });
      const check = validatePromo(row, { eventId: event.id, now, usesByEmail: 0, cartTicketTypeIds: input.lines.map((l) => l.ticketTypeId) });
      if (!check.ok) throw new PromoRejected(check.error);
      if (row!.maxUses != null) {
        // RG-PRM-03 : les réservations en cours comptent, pour ne jamais dépasser la limite au paiement
        const pending = await tx.order.count({ where: { promoCodeId: row!.id, status: "PENDING", holdExpiresAt: { gt: now } } });
        if (row!.usedCount + pending >= row!.maxUses) throw new PromoRejected("EXHAUSTED");
      }
      promo = row;
      // RG-AMB-01 : le code promo d'un ambassadeur lui attribue la vente ; le code saisi l'emporte sur le lien suivi (décidé le 16 octobre 2026)
      if (row!.ambassadorId && hasFeature(plans[effectivePlan(event.organization.subscription, now)].features, "AMBASSADORS")) {
        const owner = await tx.ambassador.findUnique({ where: { id: row!.ambassadorId }, select: { active: true } });
        if (owner?.active) ambassadorId = row!.ambassadorId;
      }
    }
    // RG-PRV-02 : un code de prévente valable ouvre l\'achat avant l\'ouverture publique (dates d\'ouverture ignorées, pas les quotas ni les fermetures)
    const opening = salesOpeningAt(event);
    if (input.presaleCode && opening && opening > now && !hasFeature(plans[effectivePlan(event.organization.subscription, now)].features, "PRESALE_CODES"))
      throw new CoreError("PRESALE_INVALID"); // RG-PRV-03 : réservée à Pro
    const presale = input.presaleCode && opening && opening > now ? await presaleCodeFor(tx, event, input.presaleCode, now) : null;
    const errors = checkCart(
      {
        id: event.id,
        status: event.status,
        capacity: event.capacity,
        soldTotal: types.reduce((n, t) => n + t.quantitySold, 0),
        heldTotal: types.reduce((n, t) => n + t.quantityHeld, 0),
        allocatedTotal: types.reduce((n, t) => n + (t.quantityAllocated ?? 0), 0),
        salesStartAt: presale ? null : salesOpeningAt(event), // RG-PRG-02 : pas d'achat avant la publication programmée
        salesEndAt: event.salesEndAt,
        maxTicketsPerOrder: event.maxTicketsPerOrder,
        startsAt: event.startsAt,
      },
      presale ? types.map((t) => ({ ...t, salesStartAt: null })) : types,
      input.lines,
      now,
      { unlocksHidden: !!promo?.unlocksHidden },
    );
    // RG-OPT-03 : options seules (vestiaire seul…) : aucun billet, et seulement des options vendables sans billet (contrôlées au chiffrage)
    const optionsOnly = input.lines.length === 0 && (input.options ?? []).some((o) => o.quantity > 0);
    const kept = optionsOnly ? errors.filter((e) => e.code !== "EMPTY_CART") : errors;
    if (kept.length > 0) throw new CartRejected(kept);
    const plan = plans[effectivePlan(event.organization.subscription, now)];
    const terms = plan.terms[event.currency];
    if (!terms) throw new CoreError("CURRENCY_NOT_SUPPORTED");
    const priced = priceOrder(types, input.lines, terms, now, { promo });
    // section 9.31 : forfait table, commission calculée par personne (part du prix de la table), comme pour des billets séparés
    for (const l of priced.lines) {
      const size = event.ticketTypes.find((t) => t.id === l.ticketTypeId)?.groupSize ?? 1;
      if (size <= 1) continue;
      const fee = size * ticketCommission(Math.round((l.unitPriceMinor - (l.unitDiscountMinor ?? 0)) / size), terms);
      priced.applicationFeeMinor += (fee - l.unitFeeMinor) * l.quantity;
      l.unitFeeMinor = fee;
    }
    const included = await tx.includedOption.findMany({ where: { ticketTypeId: { in: priced.lines.map((l) => l.ticketTypeId) } } });
    const includedLines = included.map((inc) => ({
      optionId: inc.optionId,
      quantity: inc.quantity * priced.lines.filter((l) => l.ticketTypeId === inc.ticketTypeId).reduce((n, l) => n + l.quantity, 0),
      unitPriceMinor: 0,
      unitFeeMinor: 0,
    }));
    const opts = input.options?.length
      ? await priceOptionsInTx(
          tx,
          event.id,
          input.options,
          terms,
          now,
          hasFeature(plans[effectivePlan(event.organization.subscription, now)].features, "PREPAID_OPTIONS"),
          optionsOnly,
        )
      : NO_OPTIONS;
    if (!meetsMinimumCharge(priced.totalMinor + opts.subtotalMinor, event.currency)) throw new CoreError("BELOW_MINIMUM_CHARGE");

    const perType = new Map<string, number>();
    for (const l of priced.lines) perType.set(l.ticketTypeId, (perType.get(l.ticketTypeId) ?? 0) + l.quantity);
    for (const [id, n] of perType) {
      const ok =
        await tx.$executeRaw`UPDATE "TicketType" SET "quantityHeld" = "quantityHeld" + ${n} WHERE id = ${id} AND ("quantity" IS NULL OR "quantity" - "quantitySold" - "quantityHeld" - "quantityAllocated" >= ${n})`;
      if (ok !== 1) throw new CartRejected([{ code: "NOT_ENOUGH_STOCK", ticketTypeId: id, available: 0 }]);
    }
    for (const l of priced.lines) {
      if (!l.tierId) continue;
      const ok =
        await tx.$executeRaw`UPDATE "PriceTier" SET "quantityHeld" = "quantityHeld" + ${l.quantity} WHERE id = ${l.tierId} AND ("quantityLimit" IS NULL OR "quantityLimit" - "quantitySold" - "quantityHeld" >= ${l.quantity})`;
      if (ok !== 1) throw new CartRejected([{ code: "NOT_ENOUGH_STOCK", ticketTypeId: l.ticketTypeId, available: 0 }]);
    }
    // RG-SEAT-01 : placement numéroté, meilleures places retenues avec le panier
    // « à côté de mes amis » : meilleures places cherchées près des places de l'ami
    const near = event.seatingMode === "ASSIGNED" && input.nearCode ? ((await friendSeats(event.id, input.nearCode))?.center ?? null) : null;
    if (event.seatingMode === "ASSIGNED")
      await holdSeats(
        tx,
        orderId,
        priced.lines,
        event.ticketTypes,
        new Date(now.getTime() + event.checkoutHoldMinutes * 60_000),
        event.allowSeatChoice ? input.seatIds : null,
        near,
      );
    const order = await tx.order.create({
      data: {
        id: orderId,
        reference: orderReference(),
        organizationId: event.organizationId,
        eventId: event.id,
        status: "PENDING",
        buyerEmail: "",
        buyerFirstName: "",
        buyerLastName: "",
        buyerLocale: input.locale,
        currency: event.currency,
        ambassadorId,
        ...(optionsOnly ? { optionsCode: secretToken(24), optionsShortCode: ticketShortCode() } : {}), // QR code de retrait des options (RG-OPT-03)
        subtotalMinor: priced.subtotalMinor + opts.subtotalMinor,
        discountMinor: priced.discountMinor,
        totalMinor: priced.totalMinor + opts.subtotalMinor,
        applicationFeeMinor: priced.applicationFeeMinor + opts.feeMinor,
        promoCodeId: promo?.id ?? null,
        presaleCodeId: presale?.id ?? null,
        feeSnapshot: priced.feeSnapshot as unknown as Prisma.InputJsonValue,
        holdExpiresAt: new Date(now.getTime() + event.checkoutHoldMinutes * 60_000),
        accessTokenHash,
        options: {
          create: [...opts.lines, ...includedLines].map((l) => ({
            optionId: l.optionId,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor,
            unitFeeMinor: l.unitFeeMinor,
          })),
        },
        items: {
          create: priced.lines.map((l) => ({
            ticketTypeId: l.ticketTypeId,
            priceTierId: l.tierId,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor,
            unitDiscountMinor: l.unitDiscountMinor,
            unitFeeMinor: l.unitFeeMinor,
          })),
        },
      },
      include: { items: true, options: { include: { option: { select: { name: true } } } } },
    });
    if (offer) await tx.waitlistEntry.update({ where: { id: offer.id }, data: { orderId: order.id } });
    const names = new Map(
      event.ticketTypes.map((t) => [
        t.id,
        {
          name: t.name,
          nominative: t.isNominative,
          holderEmail: t.isNominative && t.requireHolderEmail,
          tiers: new Map(t.priceTiers.map((p) => [p.id, p.name])),
        },
      ]),
    );
    return { order, event, released, names };
  }, TX_OPTIONS);
  await cancelPaymentIntents(event.organizationId, released);
  const account =
    order.totalMinor > 0
      ? await db.stripeAccount.findUnique({ where: { organizationId: event.organizationId }, select: { stripeAccountId: true, chargesEnabled: true } })
      : null;
  return {
    orderId,
    token,
    reference: order.reference,
    expiresAt: order.holdExpiresAt!,
    currency: order.currency,
    totalMinor: order.totalMinor,
    isFree: order.totalMinor === 0,
    discountMinor: order.discountMinor,
    promoCode: input.promoCode ? normalizePromoCode(input.promoCode) : null,
    options: order.options.map((o) => ({ optionId: o.optionId, name: o.option.name, quantity: o.quantity, unitPriceMinor: o.unitPriceMinor })),
    lines: order.items.map((i) => ({
      orderItemId: i.id,
      ticketTypeId: i.ticketTypeId,
      name: names.get(i.ticketTypeId)?.name ?? "",
      tierName: i.priceTierId ? (names.get(i.ticketTypeId)?.tiers.get(i.priceTierId) ?? null) : null,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor - i.unitDiscountMinor,
      nominative: names.get(i.ticketTypeId)?.nominative ?? false,
      holderEmail: names.get(i.ticketTypeId)?.holderEmail ?? false,
    })),
    questions: questionsForOrder(
      await publicQuestions(order.eventId),
      order.items.map((i) => ({ orderItemId: i.id, ticketTypeId: i.ticketTypeId })),
    ),
    stripeAccountId: account?.chargesEnabled ? account.stripeAccountId : null,
  };
}

/** L'acheteur renonce à sa réservation : les places sont libérées tout de suite. */
/** Récapitulatif d'une réservation en cours, retrouvée par son jeton : paiement par QR code sur place (section 9.27). */
export async function reservationByToken(token: string, now = new Date()): Promise<Reservation | null> {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) return null;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { ticketType: { select: { name: true, isNominative: true, requireHolderEmail: true } }, priceTier: { select: { name: true } } } },
      options: { include: { option: { select: { name: true } } } },
    },
  });
  if (!order || order.status !== "PENDING" || !order.holdExpiresAt || order.holdExpiresAt <= now) return null;
  const account =
    order.totalMinor > 0
      ? await db.stripeAccount.findUnique({ where: { organizationId: order.organizationId }, select: { stripeAccountId: true, chargesEnabled: true } })
      : null;
  return {
    orderId,
    token,
    reference: order.reference,
    expiresAt: order.holdExpiresAt,
    currency: order.currency,
    totalMinor: order.totalMinor,
    isFree: order.totalMinor === 0,
    discountMinor: order.discountMinor,
    promoCode: null,
    options: order.options.map((o) => ({ optionId: o.optionId, name: o.option.name, quantity: o.quantity, unitPriceMinor: o.unitPriceMinor })),
    lines: order.items.map((i) => ({
      orderItemId: i.id,
      ticketTypeId: i.ticketTypeId,
      name: i.ticketType.name,
      tierName: i.priceTier?.name ?? null,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor - i.unitDiscountMinor,
      nominative: i.ticketType.isNominative,
      holderEmail: i.ticketType.isNominative && i.ticketType.requireHolderEmail,
    })),
    questions: questionsForOrder(
      await publicQuestions(order.eventId),
      order.items.map((i) => ({ orderItemId: i.id, ticketTypeId: i.ticketTypeId })),
    ),
    stripeAccountId: account?.chargesEnabled ? account.stripeAccountId : null,
  };
}

export async function cancelReservation(token: string): Promise<void> {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) return;
  const order = await db.order.findUnique({ where: { id: orderId }, select: { eventId: true, organizationId: true, stripePaymentIntentId: true } });
  if (!order) return;
  const done = await db.$transaction(async (tx) => {
    await lockEvent(tx, order.eventId);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    if (o.status !== "PENDING") return false;
    if (o.source === "RESALE") {
      if (o.resaleListingId)
        await tx.resaleListing.updateMany({ where: { id: o.resaleListingId, status: "RESERVED" }, data: { status: "ACTIVE", reservedUntil: null } });
      await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), resaleListingId: null } });
      return true;
    }
    await releaseItems(tx, o.items);
    await releaseSeats(tx, orderId);
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    return true;
  }, TX_OPTIONS);
  if (done) await cancelPaymentIntents(order.organizationId, [{ paymentIntentId: order.stripePaymentIntentId }]);
}

export type PublicQuestion = Awaited<ReturnType<typeof publicQuestions>>[number];
export type AnswersInput = { order?: Record<string, unknown>; tickets?: Record<string, Array<Record<string, unknown>>> };

export interface BuyerInput {
  /** Réponses aux questions à l'achat (US-QST-01). */
  answers?: AnswersInput;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  marketingOptIn: boolean;
  /** Billets nominatifs : titulaires par ligne de commande (RG-QST-01). */
  holders?: Record<string, Array<{ firstName: string; lastName: string; email?: string | null }>>;
}

export type SubmitResult = { kind: "PAID" } | { kind: "PAYMENT"; clientSecret: string; stripeAccountId: string };

/** Étape 3 et 4 du déroulé (section 9.11) : coordonnées, puis paiement ou validation immédiate si gratuit. */
export async function submitBuyer(token: string, buyer: BuyerInput, now = new Date()): Promise<SubmitResult> {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) throw new CoreError("ORDER_NOT_FOUND");
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      event: { select: { title: true, requireBuyerPhone: true } },
      promoCode: { select: { id: true, maxUsesPerEmail: true } },
      items: { include: { ticketType: { select: { isNominative: true, requireHolderEmail: true } } } },
    },
  });
  if (order.status === "PAID") return { kind: "PAID" };
  if (order.status !== "PENDING" || !order.holdExpiresAt || order.holdExpiresAt <= now) throw new CoreError("HOLD_EXPIRED");
  if (order.event.requireBuyerPhone && !buyer.phone) throw new CoreError("PHONE_REQUIRED");
  const email = buyer.email.trim().toLowerCase();
  if (order.promoCode?.maxUsesPerEmail != null) {
    const uses = await db.order.count({ where: { promoCodeId: order.promoCode.id, buyerEmail: email, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } });
    if (uses >= order.promoCode.maxUsesPerEmail) throw new PromoRejected("EMAIL_LIMIT");
  }
  for (const item of order.source === "RESALE" ? [] : order.items) {
    if (!item.ticketType.isNominative) continue;
    // RG-QST-01 : prénom et nom de chaque titulaire, et son e-mail si le tarif le demande
    const needEmail = item.ticketType.requireHolderEmail;
    const holders = (buyer.holders?.[item.id] ?? []).map((h) => ({
      firstName: h.firstName.trim(),
      lastName: h.lastName.trim(),
      ...(needEmail ? { email: (h.email ?? "").trim().toLowerCase() } : {}),
    }));
    if (holders.length !== item.quantity || holders.some((h) => !h.firstName || !h.lastName)) throw new CoreError("HOLDERS_REQUIRED");
    if (needEmail && holders.some((h) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(h.email ?? ""))) throw new CoreError("HOLDER_EMAIL_REQUIRED");
    await db.orderItem.update({ where: { id: item.id }, data: { holders } });
  }
  // RG-BUY-09 : limite facultative de billets par adresse (commandes payées de l'événement + cette commande)
  if (order.source === "ONLINE") {
    const limit = (await db.event.findUniqueOrThrow({ where: { id: order.eventId }, select: { maxTicketsPerBuyer: true } })).maxTicketsPerBuyer;
    if (limit) {
      const already = await db.ticket.count({
        where: {
          eventId: order.eventId,
          status: { in: ["VALID", "CHECKED_IN"] },
          order: { buyerEmail: email, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, id: { not: order.id } },
        },
      });
      if (already + order.items.reduce((n, i) => n + i.quantity, 0) > limit) throw new CoreError("BUYER_LIMIT_REACHED");
    }
  }
  if (order.source !== "RESALE") await saveAnswers(order.id, order.eventId, order.items, buyer.answers ?? {});
  await db.order.update({
    where: { id: orderId },
    data: {
      buyerFirstName: buyer.firstName,
      buyerLastName: buyer.lastName,
      buyerEmail: email,
      buyerPhone: buyer.phone || null,
      marketingOptIn: buyer.marketingOptIn,
      termsVersion: BUYER_TERMS_VERSION,
    },
  });
  if (order.totalMinor === 0) {
    const outcome = await finalizeOrder(orderId); // RG-BUY-04 : commande gratuite validée immédiatement
    if (outcome !== "PAID" && outcome !== "ALREADY_PAID") throw new CoreError("HOLD_EXPIRED");
    if (outcome === "PAID") {
      // import différé : orders.ts dépend de ce module
      const { afterOrderPaid } = await import("./orders");
      await afterOrderPaid(orderId);
    }
    return { kind: "PAID" };
  }
  const s = stripe();
  const account = await db.stripeAccount.findUnique({
    where: { organizationId: order.organizationId },
    select: { stripeAccountId: true, chargesEnabled: true },
  });
  if (!s || !account?.chargesEnabled) throw new CoreError("PAYMENTS_UNAVAILABLE");
  const options = { stripeAccount: account.stripeAccountId };
  if (order.stripePaymentIntentId) {
    const existing = await s.paymentIntents.retrieve(order.stripePaymentIntentId, {}, options);
    if (existing.status === "succeeded") return { kind: "PAID" };
    if (existing.status !== "canceled" && existing.client_secret) {
      await s.paymentIntents.update(existing.id, { receipt_email: buyer.email }, options);
      return { kind: "PAYMENT", clientSecret: existing.client_secret, stripeAccountId: account.stripeAccountId };
    }
  }
  // RG-PAY-02 : charge directe sur le compte de l'organisateur, commission en frais d'application
  const intent = await s.paymentIntents.create(
    {
      amount: order.totalMinor,
      currency: order.currency.toLowerCase(),
      application_fee_amount: order.applicationFeeMinor,
      automatic_payment_methods: { enabled: true },
      receipt_email: buyer.email,
      description: `${order.event.title} · ${order.reference}`,
      metadata: { orderId: order.id, reference: order.reference, eventId: order.eventId, organizationId: order.organizationId },
    },
    { ...options, idempotencyKey: `order:${order.id}:payment-intent:${order.stripePaymentIntentId ?? "1"}` },
  );
  await db.order.update({ where: { id: orderId }, data: { stripePaymentIntentId: intent.id } });
  return { kind: "PAYMENT", clientSecret: intent.client_secret!, stripeAccountId: account.stripeAccountId };
}

export type FinalizeOutcome = "PAID" | "ALREADY_PAID" | "REFUND_REQUIRED" | "IGNORED";

class NoStockLeft extends Error {}

/**
 * Revente, étape 4 (section 9.13), dans la transaction de validation : l'ancien billet passe VOID (RESOLD),
 * un nouveau billet avec un nouveau code est créé pour l'acheteur, l'annonce passe SOLD. Aucune place n'est vendue en plus.
 */
async function resaleTransfer(
  tx: Tx,
  order: {
    id: string;
    eventId: string;
    resaleListingId: string | null;
    buyerFirstName: string;
    buyerLastName: string;
    items: Array<{ id: string; ticketTypeId: string; unitPriceMinor: number; unitDiscountMinor: number }>;
  },
  now: Date,
) {
  if (!order.resaleListingId) throw new NoStockLeft();
  await tx.$queryRaw`SELECT id FROM "ResaleListing" WHERE id = ${order.resaleListingId} FOR UPDATE`;
  const listing = await tx.resaleListing.findUnique({
    where: { id: order.resaleListingId },
    include: { ticket: { include: { ticketType: { select: { isNominative: true } } } } },
  });
  if (!listing || (listing.status !== "RESERVED" && listing.status !== "ACTIVE")) throw new NoStockLeft();
  const voided =
    await tx.$executeRaw`UPDATE "Ticket" SET status = 'VOID', "voidReason" = 'RESOLD', "voidedAt" = ${now}, "seatId" = NULL, "updatedAt" = now() WHERE id = ${listing.ticketId} AND status = 'VALID'`; // la place numérotée passe au nouveau billet
  if (voided !== 1) throw new NoStockLeft();
  const item = order.items[0]!;
  await tx.ticket.create({
    data: {
      eventId: order.eventId,
      orderId: order.id,
      orderItemId: item.id,
      ticketTypeId: item.ticketTypeId,
      code: secretToken(24),
      shortCode: ticketShortCode(),
      faceValueMinor: item.unitPriceMinor - item.unitDiscountMinor, // RG-RSL-11 : valeur faciale = prix payé en revente
      replacesTicketId: listing.ticketId,
      seatId: listing.ticket.seatId ?? null, // la place numérotée et la table suivent le billet revendu
      tableLabel: listing.ticket.tableLabel ?? null,
      ...(listing.ticket.ticketType.isNominative ? { holderFirstName: order.buyerFirstName, holderLastName: order.buyerLastName } : {}),
    },
  });
  await moveIncludedOptions(tx, listing.ticket, order.id);
  await tx.resaleListing.update({ where: { id: listing.id }, data: { status: "SOLD", soldAt: now, reservedUntil: null } });
}

/**
 * Section 9.31 : une place revendue emporte sa part des options incluses dans sa table (la quantité incluse divisée par le
 * nombre de places, arrondie à l'inférieur) ; la dernière place de la table encore au vendeur emporte le reste. Jamais ce
 * qui a déjà été servi au bar ou remboursé. Les lignes sont déplacées, à 0 € : les finances ne changent pas.
 */
export async function moveIncludedOptions(
  tx: Prisma.TransactionClient,
  sold: { orderId: string; orderItemId: string; ticketTypeId: string; tableLabel: string | null },
  toOrderId: string,
) {
  const type = await tx.ticketType.findUnique({
    where: { id: sold.ticketTypeId },
    select: { groupSize: true, includedOptions: { select: { optionId: true, quantity: true } } },
  });
  if (!type || type.includedOptions.length === 0) return;
  const size = Math.max(1, type.groupSize);
  // places de la même table encore au vendeur (le billet revendu vient d'être annulé)
  const left = await tx.ticket.count({
    where: { orderId: sold.orderId, orderItemId: sold.orderItemId, tableLabel: sold.tableLabel, status: { in: ["VALID", "CHECKED_IN"] } },
  });
  for (const inc of type.includedOptions) {
    const share = Math.floor(inc.quantity / size) + (left === 0 ? inc.quantity % size : 0);
    if (share <= 0) continue;
    const lines = await tx.orderOption.findMany({
      where: { orderId: sold.orderId, optionId: inc.optionId, unitPriceMinor: 0 },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    let rest = share;
    for (const l of lines) {
      const take = Math.min(l.quantity - l.redeemed - l.refunded, rest);
      if (take <= 0) continue;
      if (take === l.quantity) await tx.orderOption.delete({ where: { id: l.id } });
      else await tx.orderOption.update({ where: { id: l.id }, data: { quantity: { decrement: take } } });
      rest -= take;
      if (rest === 0) break;
    }
    if (share - rest > 0)
      await tx.orderOption.create({ data: { orderId: toOrderId, optionId: inc.optionId, quantity: share - rest, unitPriceMinor: 0, unitFeeMinor: 0 } });
  }
}

/**
 * RG-BUY-07 : validation d'une commande, une seule fois. Réservé → vendu, billets créés, contact à jour.
 * Paiement arrivé après expiration (RG-BUY-02) : honoré si les places sont encore libres, sinon remboursement.
 */
export async function finalizeOrder(
  orderId: string,
  payment?: { paymentIntentId: string; amountMinor: number; currency: string; chargeId?: string | null; paymentMethodType?: string | null },
  now = new Date(),
): Promise<FinalizeOutcome> {
  const head = await db.order.findUnique({ where: { id: orderId }, select: { eventId: true } });
  if (!head) return "IGNORED";
  try {
    return await db.$transaction(async (tx) => {
      await lockEvent(tx, head.eventId);
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, event: { select: { capacity: true } } } });
      if (order.status === "PAID") return "ALREADY_PAID" as const;
      if (!["PENDING", "EXPIRED", "FAILED"].includes(order.status)) return "IGNORED" as const;
      if (payment && (payment.amountMinor !== order.totalMinor || payment.currency.toUpperCase() !== order.currency))
        throw new CoreError("PAYMENT_AMOUNT_MISMATCH");
      if (order.source === "RESALE") await resaleTransfer(tx, order, now);
      else {
        if (order.status === "PENDING") {
          for (const it of order.items) {
            await tx.$executeRaw`UPDATE "TicketType" SET "quantityHeld" = "quantityHeld" - ${it.quantity}, "quantitySold" = "quantitySold" + ${it.quantity}, "priceLockedAt" = COALESCE("priceLockedAt", ${now}) WHERE id = ${it.ticketTypeId}`;
            if (it.priceTierId)
              await tx.$executeRaw`UPDATE "PriceTier" SET "quantityHeld" = "quantityHeld" - ${it.quantity}, "quantitySold" = "quantitySold" + ${it.quantity}, "lockedAt" = COALESCE("lockedAt", ${now}) WHERE id = ${it.priceTierId}`;
          }
        } else {
          // la réservation a été libérée : on reprend des places seulement si elles sont encore disponibles
          const count = order.items.reduce((n, it) => n + it.quantity, 0);
          if (order.event.capacity != null) {
            const totals = await tx.ticketType.aggregate({
              where: { eventId: order.eventId },
              _sum: { quantitySold: true, quantityHeld: true, quantityAllocated: true },
            });
            if ((totals._sum.quantitySold ?? 0) + (totals._sum.quantityHeld ?? 0) + (totals._sum.quantityAllocated ?? 0) + count > order.event.capacity)
              throw new NoStockLeft();
          }
          for (const it of order.items) {
            const ok =
              await tx.$executeRaw`UPDATE "TicketType" SET "quantitySold" = "quantitySold" + ${it.quantity}, "priceLockedAt" = COALESCE("priceLockedAt", ${now}) WHERE id = ${it.ticketTypeId} AND ("quantity" IS NULL OR "quantity" - "quantitySold" - "quantityHeld" - "quantityAllocated" >= ${it.quantity})`;
            if (ok !== 1) throw new NoStockLeft();
            if (it.priceTierId) {
              const okTier =
                await tx.$executeRaw`UPDATE "PriceTier" SET "quantitySold" = "quantitySold" + ${it.quantity}, "lockedAt" = COALESCE("lockedAt", ${now}) WHERE id = ${it.priceTierId} AND ("quantityLimit" IS NULL OR "quantityLimit" - "quantitySold" - "quantityHeld" >= ${it.quantity})`;
              if (okTier !== 1) throw new NoStockLeft();
            }
          }
        }
        if (order.promoCodeId) {
          // RG-PRM-03 : compteur incrémenté au paiement, sans jamais dépasser la limite
          const counted =
            await tx.$executeRaw`UPDATE "PromoCode" SET "usedCount" = "usedCount" + 1 WHERE id = ${order.promoCodeId} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
          if (counted !== 1 && order.status !== "PENDING") throw new NoStockLeft();
        }
        if (order.presaleCodeId) {
          // RG-PRV-02 : compteur de la prévente incrémenté au paiement, sans jamais dépasser la limite
          const presaleCounted =
            await tx.$executeRaw`UPDATE "PresaleCode" SET "usedCount" = "usedCount" + 1 WHERE id = ${order.presaleCodeId} AND "usedCount" < "maxUses"`;
          if (presaleCounted !== 1 && order.status !== "PENDING") throw new NoStockLeft();
        }
        // section 9.9 : sièges retenus attribués aux billets, dans l'ordre du plan
        const seatsBy = await seatsForTickets(tx, order.id);
        const seatCategory = seatsBy.size
          ? new Map(
              (
                await tx.ticketType.findMany({ where: { id: { in: order.items.map((i) => i.ticketTypeId) } }, select: { id: true, seatingCategoryId: true } })
              ).map((t) => [t.id, t.seatingCategoryId]),
            )
          : new Map<string, string | null>();
        const nextSeat = (ticketTypeId: string) => {
          const c = seatCategory.get(ticketTypeId);
          return c ? (seatsBy.get(c)?.shift() ?? null) : null;
        };
        // section 9.31 : un forfait table donne plusieurs billets par achat, chacun avec le nom de sa table
        const groups = new Map(
          (
            await tx.ticketType.findMany({
              where: { id: { in: order.items.map((i) => i.ticketTypeId) } },
              select: { id: true, groupSize: true, tableLabels: true, quantitySold: true },
            })
          ).map((t) => [t.id, { ...t, next: t.quantitySold - order.items.filter((i) => i.ticketTypeId === t.id).reduce((n, i) => n + i.quantity, 0) }]),
        );
        const created = await tx.ticket.createManyAndReturn({
          select: { id: true, orderItemId: true },
          data: order.items.flatMap((it) => {
            const holders = Array.isArray(it.holders) ? (it.holders as Array<{ firstName?: string; lastName?: string; email?: string }>) : [];
            const g = groups.get(it.ticketTypeId);
            const size = g?.groupSize ?? 1;
            const net = it.unitPriceMinor - it.unitDiscountMinor;
            const share = Math.floor(net / size);
            const labels = Array.from({ length: it.quantity }, () => {
              if (!g || size === 1) return null;
              const n = g.next++;
              return g.tableLabels[n] ?? `Table ${n + 1}`;
            });
            return Array.from({ length: it.quantity * size }, (_, i) => ({
              eventId: order.eventId,
              orderId: order.id,
              orderItemId: it.id,
              ticketTypeId: it.ticketTypeId,
              code: secretToken(24),
              shortCode: ticketShortCode(),
              faceValueMinor: size === 1 ? net : share + (i % size === 0 ? net - share * size : 0), // les centimes d'arrondi sur le premier billet de la table
              tableLabel: labels[Math.floor(i / size)] ?? null,
              holderFirstName: holders[i]?.firstName ?? null,
              holderLastName: holders[i]?.lastName ?? null,
              holderEmail: holders[i]?.email ?? null,
              seatId: nextSeat(it.ticketTypeId),
            }));
          }),
        });
        if (seatsBy.size) await markSeatsSold(tx, order.id);
        // réponses par billet : rattachées aux billets créés, dans l'ordre de leur ligne
        const pending = await tx.questionAnswer.findMany({ where: { orderId: order.id, ticketId: null }, select: { id: true, value: true } });
        for (const a of pending) {
          const v = a.value as { item?: string; index?: number };
          if (!v?.item || v.index == null) continue;
          const ticket = created.filter((t) => t.orderItemId === v.item)[v.index];
          if (ticket) await tx.questionAnswer.update({ where: { id: a.id }, data: { ticketId: ticket.id } });
        }
      }
      const ticketCount = order.items.reduce((n, it) => n + it.quantity, 0);
      const contact = await tx.contact.upsert({
        where: { organizationId_email: { organizationId: order.organizationId, email: order.buyerEmail } },
        create: {
          organizationId: order.organizationId,
          email: order.buyerEmail,
          firstName: order.buyerFirstName,
          lastName: order.buyerLastName,
          locale: order.buyerLocale,
          ordersCount: 1,
          ticketsCount: ticketCount,
          totalSpentMinor: order.totalMinor,
          lastOrderAt: now,
          ...(order.marketingOptIn ? { marketingConsent: true, consentAt: now, consentSource: "CHECKOUT" as const } : {}),
        },
        update: {
          firstName: order.buyerFirstName,
          lastName: order.buyerLastName,
          ordersCount: { increment: 1 },
          ticketsCount: { increment: ticketCount },
          totalSpentMinor: { increment: order.totalMinor },
          lastOrderAt: now,
          ...(order.marketingOptIn ? { marketingConsent: true, consentAt: now, consentSource: "CHECKOUT" as const, unsubscribedAt: null } : {}),
        },
      });
      // RG-LIEU-02 et 03 : part du lieu partenaire figée au paiement, si l'événement est rattaché à un lieu à ce moment
      const venue = (
        await tx.event.findUnique({ where: { id: order.eventId }, select: { venuePartner: { select: { id: true, shareBps: true, active: true } } } })
      )?.venuePartner;
      await tx.order.update({
        where: { id: order.id },
        data: {
          ...(venue?.active ? { venuePartnerId: venue.id, venueShareMinor: Math.floor((order.applicationFeeMinor * venue.shareBps) / 10_000) } : {}),
          status: "PAID",
          paidAt: now,
          holdExpiresAt: null,
          contactId: contact.id,
          ...(payment
            ? { stripePaymentIntentId: payment.paymentIntentId, stripeChargeId: payment.chargeId ?? null, paymentMethodType: payment.paymentMethodType ?? null }
            : {}),
        },
      });
      return "PAID" as const;
    }, TX_OPTIONS);
  } catch (err) {
    if (err instanceof NoStockLeft) {
      await db.order.update({ where: { id: orderId }, data: { status: "FAILED" } });
      return "REFUND_REQUIRED";
    }
    throw err;
  }
}

/** Paiement tardif sans place disponible : remboursement intégral, commission comprise (Evoly n'a rien vendu). */
export async function refundUnfulfilledPayment(orderId: string): Promise<void> {
  const s = stripe();
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      stripePaymentIntentId: true,
      organizationId: true,
      totalMinor: true,
      currency: true,
      buyerEmail: true,
      buyerLocale: true,
      event: { select: { title: true } },
      organization: { select: { name: true } },
    },
  });
  const account = order ? await db.stripeAccount.findUnique({ where: { organizationId: order.organizationId }, select: { stripeAccountId: true } }) : null;
  if (!s || !order?.stripePaymentIntentId || !account) return;
  await s.refunds.create(
    {
      payment_intent: order.stripePaymentIntentId,
      refund_application_fee: true,
      reason: "requested_by_customer",
      metadata: { orderId, cause: "SOLD_OUT_AFTER_HOLD_EXPIRY" },
    },
    { stripeAccount: account.stripeAccountId, idempotencyKey: `order:${orderId}:unfulfilled-refund` },
  );
  await db.order.update({ where: { id: orderId }, data: { status: "REFUNDED", refundedMinor: order.totalMinor } });
  // section 10 : order.late_payment_refunded, pour que l'acheteur comprenne le débit puis le remboursement
  const locale = toLocale(order.buyerLocale);
  const mail = latePaymentRefundEmail({
    brand: await emailBrandFor(order.organizationId).catch(() => null),
    locale,
    organizationName: order.organization.name,
    eventTitle: order.event.title,
    amount: formatMoney(order.totalMinor, order.currency, locale),
  });
  await sendEmail({
    to: order.buyerEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    category: "SERVICE",
    template: "order.late_payment_refunded",
    organizationId: order.organizationId,
    orderId,
    fromName: order.organization.name,
  }).catch((err) => console.error("e-mail de paiement tardif", orderId, safeError(err)));
}

/** RG-QST-02 : l'acheteur modifie le titulaire d'un billet jusqu'au début de l'événement, sauf interdiction de l'organisateur. */
export async function updateTicketHolder(token: string, ticketId: string, holder: { firstName: string; lastName: string }, now = new Date()): Promise<void> {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) throw new CoreError("ORDER_NOT_FOUND");
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, orderId }, include: { event: { select: { startsAt: true, allowHolderChange: true } } } });
  if (!ticket) throw new CoreError("NOT_FOUND");
  if (!ticket.event.allowHolderChange) throw new CoreError("HOLDER_CHANGE_DISABLED");
  if (ticket.event.startsAt <= now) throw new CoreError("EVENT_STARTED");
  if (ticket.status !== "VALID") throw new CoreError("TICKET_NOT_VALID");
  await db.ticket.update({ where: { id: ticket.id }, data: { holderFirstName: holder.firstName.trim(), holderLastName: holder.lastName.trim() } });
}

/**
 * US-QST-01 : réponses vérifiées côté serveur (les contrôles du navigateur ne suffisent pas), puis enregistrées.
 * Réponses par billet : gardées avec leur position, rattachées au billet dès sa création.
 */
async function saveAnswers(
  orderId: string,
  eventId: string,
  items: ReadonlyArray<{ id: string; ticketTypeId: string; quantity: number }>,
  answers: AnswersInput,
) {
  const { order: forOrder, perLine } = questionsForOrder(
    await publicQuestions(eventId),
    items.map((i) => ({ orderItemId: i.id, ticketTypeId: i.ticketTypeId })),
  );
  const rows: Array<{ questionId: string; orderId: string; value: { value: string | number | boolean | string[]; item?: string; index?: number } }> = [];
  for (const q of forOrder) {
    const r = answerFor(q, answers.order?.[q.id]);
    if (!r.ok) throw new CoreError("ANSWERS_INVALID");
    if (r.value !== null) rows.push({ questionId: q.id, orderId, value: { value: r.value } });
  }
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      for (const q of perLine[item.id] ?? []) {
        const r = answerFor(q, answers.tickets?.[item.id]?.[i]?.[q.id]);
        if (!r.ok) throw new CoreError("ANSWERS_INVALID");
        if (r.value !== null) rows.push({ questionId: q.id, orderId, value: { value: r.value, item: item.id, index: i } });
      }
    }
  }
  await db.$transaction([db.questionAnswer.deleteMany({ where: { orderId } }), ...(rows.length ? [db.questionAnswer.createMany({ data: rows })] : [])]);
}

/** Places retenues par une réservation (affichées à l'acheteur : « vos places »). */
export async function reservationSeats(orderId: string) {
  const seats = await db.seat.findMany({
    where: { holdOrderId: orderId, status: "HELD" },
    select: { id: true, label: true, sortOrder: true, row: { select: { name: true, sortOrder: true } } },
  });
  return seats.sort((a, b) => a.row.sortOrder - b.row.sortOrder || a.sortOrder - b.sortOrder).map((s) => ({ id: s.id, row: s.row.name, label: s.label }));
}

/**
 * Section 9.9 : l'acheteur change ses places pendant sa réservation (même commande, même temps restant). Places
 * libérées puis reprises sous le verrou de l'événement, avec les contrôles de la réservation (nombre par catégorie,
 * disponibilité, sièges isolés) : en cas d'échec, la transaction est annulée et il garde ses places d'origine.
 */
export async function changeReservationSeats(token: string, seatIds: string[], now = new Date()) {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) throw new CoreError("NOT_FOUND");
  const head = await db.order.findUnique({ where: { id: orderId }, select: { eventId: true } });
  if (!head) throw new CoreError("NOT_FOUND");
  await db.$transaction(async (tx) => {
    await lockEvent(tx, head.eventId);
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, event: { select: { seatingMode: true, allowSeatChoice: true, ticketTypes: { select: { id: true, seatingCategoryId: true } } } } },
    });
    if (order.status !== "PENDING" || !order.holdExpiresAt || order.holdExpiresAt < now) throw new CoreError("RESERVATION_EXPIRED");
    if (order.event.seatingMode !== "ASSIGNED" || !order.event.allowSeatChoice) throw new CoreError("SEAT_CHOICE_DISABLED");
    await tx.seat.updateMany({ where: { holdOrderId: order.id, status: "HELD" }, data: { status: "AVAILABLE", holdOrderId: null, holdExpiresAt: null } });
    const lines = order.items.map((i) => ({ ticketTypeId: i.ticketTypeId, quantity: i.quantity }));
    await holdSeats(tx, order.id, lines, order.event.ticketTypes, order.holdExpiresAt, seatIds);
  }, TX_OPTIONS);
  return reservationSeats(orderId);
}
