import "server-only";
import { alertSupport, notify } from "./notifications";
import {
  checkResalePrice,
  CoreError,
  effectivePlan,
  estimateBankFee,
  groupListings,
  humanCode,
  orderReference,
  originalPaymentRefundable,
  parseMajorToMinor,
  resaleAmounts,
  resaleBlockers,
  resaleCutoff,
  resaleLinkCode,
  sha256Hex,
} from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { audit } from "./audit";
import { findOrderIdByToken, orderAccessToken, type Reservation } from "./checkout";
import { sendEmail } from "./email/send";
import { resaleSellerEmail } from "./email/templates";
import { emailBrandFor } from "./email/brand";
import { getPlans } from "./plans";
import { organizationPublicUrl } from "./urls";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const OPEN = ["ACTIVE", "RESERVED"] as const;

async function termsFor(organizationId: string, currency: string) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { subscription: { select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } } },
  });
  const terms = (await getPlans())[effectivePlan(org.subscription, new Date())].terms[currency];
  if (!terms) throw new CoreError("CURRENCY_NOT_SUPPORTED");
  return terms;
}

/** Lien public d'une annonce : evoly.me/r/[code] (redirige vers la page de revente de l'organisation). */
export function resaleShortUrl(linkCode: string): string {
  return `${env().NEXT_PUBLIC_SHORT_LINK_BASE ?? env().NEXT_PUBLIC_APP_URL}/r/${linkCode}`;
}

/** Billet d'une commande de l'acheteur (lien magique) et tout ce qu'il faut pour décider de sa revente. */
async function sellerTicket(token: string, ticketId: string) {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) throw new CoreError("ORDER_NOT_FOUND");
  const ticket = await db.ticket.findFirst({
    where: { id: ticketId, orderId },
    include: {
      order: true,
      ticketType: { select: { id: true, name: true, resaleAllowed: true } },
      event: {
        select: { id: true, slug: true, status: true, startsAt: true, resaleEnabled: true, resaleCutoffMinutes: true, organizationId: true, currency: true },
      },
      resaleListings: { where: { status: { in: [...OPEN] } } },
    },
  });
  if (!ticket) throw new CoreError("NOT_FOUND");
  return ticket;
}

/** RG-RSL-01 à 05 : conditions et montant estimé rendu au vendeur (RG-FEE-51). */
export async function resaleQuote(token: string, ticketId: string, now = new Date()) {
  const t = await sellerTicket(token, ticketId);
  const blockers = resaleBlockers({
    eventStatus: t.event.status,
    eventResaleEnabled: t.event.resaleEnabled,
    ticketTypeResaleAllowed: t.ticketType.resaleAllowed,
    eventStartsAt: t.event.startsAt,
    resaleCutoffMinutes: t.event.resaleCutoffMinutes,
    ticketStatus: t.status,
    hasOpenListing: t.resaleListings.length > 0,
    originalPaymentRefundable: originalPaymentRefundable(t.order, t.faceValueMinor, now),
    now,
  });
  const terms = await termsFor(t.event.organizationId, t.event.currency);
  return { ticket: t, blockers, terms, faceValueMinor: t.faceValueMinor, cutoff: resaleCutoff(t.event.startsAt, t.event.resaleCutoffMinutes) };
}

/** Mise en revente (section 9.13) : prix au plus égal à la valeur faciale, lien partageable. */
export async function createListing(token: string, ticketId: string, priceInput: string, now = new Date()) {
  const q = await resaleQuote(token, ticketId, now);
  if (q.blockers.length > 0) throw new CoreError(`RESALE_${q.blockers[0]}`);
  const priceMinor = parseMajorToMinor(priceInput);
  if (priceMinor == null) throw new CoreError("INVALID_PRICE");
  const check = checkResalePrice(priceMinor, q.faceValueMinor);
  if (check !== "OK") throw new CoreError(`RESALE_${check}`);
  if (priceMinor > 0) {
    const account = await db.stripeAccount.findUnique({ where: { organizationId: q.ticket.event.organizationId }, select: { chargesEnabled: true } });
    if (!account?.chargesEnabled) throw new CoreError("RESALE_PAYMENTS_UNAVAILABLE");
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const listing = await db.resaleListing.create({
        data: {
          eventId: q.ticket.eventId,
          ticketId,
          sellerOrderId: q.ticket.orderId,
          sellerEmail: q.ticket.order.buyerEmail,
          linkCode: resaleLinkCode(q.ticket.event.slug),
          priceMinor,
          faceValueMinor: q.faceValueMinor,
          currency: q.ticket.event.currency,
          expiresAt: q.cutoff,
        },
      });
      await audit({
        action: "resale.listed",
        organizationId: q.ticket.event.organizationId,
        actorType: "SYSTEM",
        targetType: "ResaleListing",
        targetId: listing.id,
        metadata: { priceMinor, via: "buyer_link" },
      });
      return listing;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const open = await db.resaleListing.count({ where: { ticketId, status: { in: [...OPEN] } } });
      if (open > 0) throw new CoreError("RESALE_ALREADY_LISTED"); // index unique partiel : une seule annonce ouverte (RG-RSL-03)
    }
  }
  throw new Error("inaccessible");
}

/** RG-RSL-07 : le vendeur retire une annonce active ; une annonce réservée ne peut pas l'être. */
export async function withdrawListing(token: string, listingId: string) {
  const orderId = await findOrderIdByToken(token);
  const listing = orderId ? await db.resaleListing.findFirst({ where: { id: listingId, sellerOrderId: orderId } }) : null;
  if (!listing) throw new CoreError("NOT_FOUND");
  const done = await db.resaleListing.updateMany({ where: { id: listing.id, status: "ACTIVE" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  if (done.count === 0) throw new CoreError(listing.status === "RESERVED" ? "RESALE_RESERVED" : "RESALE_NOT_ACTIVE");
}

type CloseReason = "ORGANIZER" | "DISABLED" | "EXPIRED" | "TICKET_USED";

/** Fermeture d'annonces actives, avec prévenance des vendeurs (RG-RSL-08, RG-RSL-09). */
async function closeListings(where: Prisma.ResaleListingWhereInput, status: "CANCELLED" | "EXPIRED", reason: CloseReason) {
  const listings = await db.resaleListing.findMany({
    where: { ...where, status: "ACTIVE" },
    include: {
      event: { select: { title: true, organizationId: true, organization: { select: { name: true } } } },
      sellerOrder: { select: { buyerLocale: true, buyerFirstName: true } },
    },
  });
  for (const l of listings) {
    const done = await db.resaleListing.updateMany({
      where: { id: l.id, status: "ACTIVE" },
      data: { status, cancelledAt: status === "CANCELLED" ? new Date() : null },
    });
    if (done.count === 0 || reason === "TICKET_USED") continue;
    const locale = (l.sellerOrder.buyerLocale === "en" ? "en" : "fr") as Locale;
    const brand = await emailBrandFor(l.event.organizationId);
    const mail = resaleSellerEmail({
      brand,
      kind: status === "EXPIRED" ? "EXPIRED" : "CANCELLED",
      locale,
      organizationName: l.event.organization.name,
      eventTitle: l.event.title,
      firstName: l.sellerOrder.buyerFirstName,
      amount: null,
    });
    await sendEmail({
      ...mail,
      to: l.sellerEmail,
      template: `resale.${status.toLowerCase()}`,
      category: "TRANSACTIONAL",
      organizationId: l.event.organizationId,
      fromName: brand.fromName,
      replyTo: brand.replyTo,
    }).catch((err) => console.error("e-mail vendeur", l.id, err));
  }
  return listings.length;
}

export const cancelListingsForEvent = (eventId: string) => closeListings({ eventId }, "CANCELLED", "DISABLED");
export const cancelListingsForTicketType = (ticketTypeId: string) => closeListings({ ticket: { ticketTypeId } }, "CANCELLED", "DISABLED");
export const cancelListingsForTicket = (ticketId: string) => closeListings({ ticketId }, "CANCELLED", "TICKET_USED");

/** RG-RSL-09 : l'organisateur retire une annonce précise. */
export async function cancelListingByOrganizer(organizationId: string, eventId: string, listingId: string, actorUserId: string) {
  const listing = await db.resaleListing.findFirst({ where: { id: listingId, eventId, event: { organizationId } } });
  if (!listing) throw new CoreError("NOT_FOUND");
  if (listing.status !== "ACTIVE") throw new CoreError(listing.status === "RESERVED" ? "RESALE_RESERVED" : "RESALE_NOT_ACTIVE");
  await closeListings({ id: listing.id }, "CANCELLED", "ORGANIZER");
  await audit({ action: "resale.cancelled_by_organizer", organizationId, actorUserId, targetType: "ResaleListing", targetId: listing.id });
}

/** RG-RSL-08 : fin de la revente. Tâche planifiée, et vérification à chaque lecture (les requêtes filtrent sur expiresAt). */
export async function expireResaleListings(now = new Date()): Promise<number> {
  return closeListings({ expiresAt: { lte: now } }, "EXPIRED", "EXPIRED");
}

/** Section Revente de la page de vente (RG-PUB-04) : annonces disponibles, regroupées par tarif. */
export async function publicListings(eventId: string, now = new Date()) {
  const rows = await db.resaleListing.findMany({
    where: { eventId, showOnEventPage: true, expiresAt: { gt: now }, OR: [{ status: "ACTIVE" }, { status: "RESERVED", reservedUntil: { lt: now } }] },
    select: { id: true, linkCode: true, priceMinor: true, createdAt: true, ticket: { select: { ticketTypeId: true, ticketType: { select: { name: true } } } } },
  });
  const codes = new Map(rows.map((r) => [r.id, r.linkCode]));
  return groupListings(
    rows.map((r) => ({
      id: r.id,
      ticketTypeId: r.ticket.ticketTypeId,
      ticketTypeName: r.ticket.ticketType.name,
      priceMinor: r.priceMinor,
      createdAt: r.createdAt,
    })),
  ).map((g) => ({ ...g, listings: g.listings.map((l) => ({ ...l, linkCode: codes.get(l.id)! })) }));
}

export async function getListingByCode(linkCode: string) {
  return db.resaleListing.findUnique({
    where: { linkCode },
    include: {
      ticket: { select: { status: true, ticketType: { select: { name: true, description: true } } } },
      event: { include: { organization: { select: { subdomain: true, slug: true, name: true } } } },
    },
  });
}

/**
 * Achat d'une place en revente, étape 2 : l'annonce est réservée pendant la durée de réservation de l'événement,
 * les autres visiteurs la voient indisponible. Le paiement suit le tunnel habituel (commande RESALE).
 */
export async function reserveResale(linkCode: string, locale: string, now = new Date()): Promise<Reservation> {
  const orderId = `c${humanCode(24, ID_ALPHABET)}`;
  const token = orderAccessToken(orderId, 1);
  const accessTokenHash = await sha256Hex(token);
  const head = await db.resaleListing.findUnique({
    where: { linkCode },
    select: { eventId: true, currency: true, event: { select: { organizationId: true } } },
  });
  if (!head) throw new CoreError("NOT_FOUND");
  const terms = await termsFor(head.event.organizationId, head.currency);
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${head.eventId} FOR UPDATE`;
      const listing = await tx.resaleListing.findUniqueOrThrow({
        where: { linkCode },
        include: {
          ticket: { include: { ticketType: { select: { id: true, name: true } } } },
          event: { select: { checkoutHoldMinutes: true, organizationId: true } },
        },
      });
      const stale = listing.status === "RESERVED" && (!listing.reservedUntil || listing.reservedUntil <= now);
      if (listing.status !== "ACTIVE" && !stale) throw new CoreError(listing.status === "RESERVED" ? "RESALE_RESERVED" : "RESALE_UNAVAILABLE");
      if (listing.expiresAt <= now) throw new CoreError("RESALE_EXPIRED");
      if (listing.ticket.status !== "VALID") throw new CoreError("RESALE_UNAVAILABLE");
      // la réservation précédente, expirée, rend l'annonce : sa commande n'y est plus rattachée
      await tx.order.updateMany({
        where: { resaleListingId: listing.id, status: { not: "PAID" } },
        data: { resaleListingId: null, ...(stale ? { status: "EXPIRED" } : {}) },
      });
      const amounts = resaleAmounts(listing.priceMinor, terms, estimateBankFee(listing.priceMinor));
      const holdExpiresAt = new Date(now.getTime() + listing.event.checkoutHoldMinutes * 60_000);
      const order = await tx.order.create({
        data: {
          id: orderId,
          reference: orderReference(),
          organizationId: listing.event.organizationId,
          eventId: listing.eventId,
          source: "RESALE",
          status: "PENDING",
          buyerEmail: "",
          buyerFirstName: "",
          buyerLastName: "",
          buyerLocale: locale,
          currency: listing.currency,
          subtotalMinor: listing.priceMinor,
          totalMinor: listing.priceMinor,
          applicationFeeMinor: amounts.commissionMinor,
          feeSnapshot: { resale: true, terms } as unknown as Prisma.InputJsonValue,
          holdExpiresAt,
          accessTokenHash,
          resaleListingId: listing.id,
          items: {
            create: { ticketTypeId: listing.ticket.ticketTypeId, quantity: 1, unitPriceMinor: listing.priceMinor, unitFeeMinor: amounts.commissionMinor },
          },
        },
        include: { items: true },
      });
      await tx.resaleListing.update({ where: { id: listing.id }, data: { status: "RESERVED", reservedUntil: holdExpiresAt } });
      return { order, listing };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
  const account =
    result.order.totalMinor > 0
      ? await db.stripeAccount.findUnique({ where: { organizationId: result.order.organizationId }, select: { stripeAccountId: true, chargesEnabled: true } })
      : null;
  return {
    orderId,
    token,
    reference: result.order.reference,
    expiresAt: result.order.holdExpiresAt!,
    currency: result.order.currency,
    totalMinor: result.order.totalMinor,
    isFree: result.order.totalMinor === 0,
    discountMinor: 0,
    promoCode: null,
    // RG-RSL-10 : le nouveau billet porte le nom de l'acheteur, pas de saisie de titulaire
    lines: result.order.items.map((i) => ({
      orderItemId: i.id,
      ticketTypeId: i.ticketTypeId,
      name: result.listing.ticket.ticketType.name,
      tierName: null,
      quantity: 1,
      unitPriceMinor: i.unitPriceMinor,
      nominative: false,
    })),
    stripeAccountId: account?.chargesEnabled ? account.stripeAccountId : null,
    questions: { order: [], perLine: {} }, // revente : pas de questions (réponses d'origine conservées sur la commande du vendeur)
  };
}

/**
 * Après la validation d'une commande de revente (étapes 5 et 6) : remboursement partiel du vendeur sur sa commande
 * d'origine, ajusté avec les frais Stripe réels du paiement de l'acheteur ; e-mail au vendeur ; notification à l'organisateur.
 * RG-RSL-06 : si le remboursement échoue, l'annonce passe FAILED et le cas est signalé ; l'acheteur garde son billet.
 */
export async function settleResale(buyerOrderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: buyerOrderId },
    include: { resaleListing: { include: { sellerOrder: true, event: { select: { title: true, organization: { select: { name: true } } } } } } },
  });
  const listing = order?.resaleListing;
  if (!order || order.source !== "RESALE" || !listing || listing.status !== "SOLD" || listing.sellerRefundMinor != null) return;
  const terms = (order.feeSnapshot as { terms?: Parameters<typeof resaleAmounts>[1] } | null)?.terms ?? (await termsFor(order.organizationId, order.currency));
  const amounts = resaleAmounts(listing.priceMinor, terms, order.paymentFeeMinor ?? estimateBankFee(listing.priceMinor));
  const seller = listing.sellerOrder;
  const locale = (seller.buyerLocale === "en" ? "en" : "fr") as Locale;
  if (amounts.sellerRefundMinor > 0) {
    const s = stripe();
    const account = await db.stripeAccount.findUnique({ where: { organizationId: order.organizationId }, select: { stripeAccountId: true } });
    try {
      if (!s || !account || !seller.stripePaymentIntentId) throw new Error("paiement d'origine introuvable ou Stripe indisponible");
      const refund = await s.refunds.create(
        {
          payment_intent: seller.stripePaymentIntentId,
          amount: amounts.sellerRefundMinor,
          refund_application_fee: false,
          reason: "requested_by_customer",
          metadata: { resaleListingId: listing.id, buyerOrderId },
        },
        { stripeAccount: account.stripeAccountId, idempotencyKey: `resale:${listing.id}:seller-refund` },
      );
      await db.$transaction([
        db.resaleListing.update({ where: { id: listing.id }, data: { sellerRefundMinor: amounts.sellerRefundMinor, sellerStripeRefundId: refund.id } }),
        db.order.update({
          where: { id: seller.id },
          data: {
            refundedMinor: { increment: amounts.sellerRefundMinor },
            status: seller.refundedMinor + amounts.sellerRefundMinor >= seller.totalMinor ? "REFUNDED" : "PARTIALLY_REFUNDED",
          },
        }),
      ]);
    } catch (err) {
      await db.resaleListing.update({ where: { id: listing.id }, data: { status: "FAILED", failureReason: String(err).slice(0, 300) } });
      await audit({
        action: "resale.seller_refund_failed",
        organizationId: order.organizationId,
        actorType: "SYSTEM",
        targetType: "ResaleListing",
        targetId: listing.id,
        metadata: { error: String(err).slice(0, 300) },
      });
      console.error("revente : remboursement du vendeur à traiter par le support", listing.id, err instanceof Error ? err.message : "erreur");
      await alertSupport(
        "remboursement du vendeur impossible",
        `Annonce ${listing.id}\nCommande du vendeur ${seller.id}\nMontant ${amounts.sellerRefundMinor} (centimes)\nErreur : ${String(err).slice(0, 300)}`,
      );
      return;
    }
  } else {
    await db.resaleListing.update({ where: { id: listing.id }, data: { sellerRefundMinor: 0 } });
  }
  const brand = await emailBrandFor(order.organizationId);
  const mail = resaleSellerEmail({
    brand,
    kind: "SOLD",
    locale,
    organizationName: listing.event.organization.name,
    eventTitle: listing.event.title,
    firstName: seller.buyerFirstName,
    amount: amounts.sellerRefundMinor > 0 ? formatMoney(amounts.sellerRefundMinor, order.currency, locale) : null,
  });
  await sendEmail({
    ...mail,
    to: listing.sellerEmail,
    template: "resale.sold",
    category: "TRANSACTIONAL",
    organizationId: order.organizationId,
    orderId: seller.id,
    fromName: brand.fromName,
    replyTo: brand.replyTo,
  }).catch((err) => console.error("e-mail vendeur", listing.id, err));
  await notify(order.organizationId, "RESALE_SOLD", {
    title: listing.event.title,
    body: `Une place a été revendue${amounts.sellerRefundMinor > 0 ? `, vendeur remboursé de ${formatMoney(amounts.sellerRefundMinor, order.currency, locale)}` : ""}.`,
    link: `/events/${listing.eventId}/resale`,
  });
}

export async function listingsForOrganizer(eventId: string) {
  return db.resaleListing.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: { ticket: { select: { shortCode: true, ticketType: { select: { name: true } } } } },
  });
}

export const resaleEventUrl = (org: { subdomain: string | null; slug: string }, linkCode: string) =>
  `${organizationPublicUrl(org.subdomain ?? org.slug)}/revente/${linkCode}`;

/**
 * US-RSL-05 : vue d'ensemble des reventes de l'organisation. Chiffres de toutes ses annonces, événements à venir ou
 * avec annonces (état de la revente, compteurs), et dernières annonces tous événements confondus.
 */
export async function organizationResaleOverview(organizationId: string, now = new Date()) {
  const [grouped, recent, events] = await Promise.all([
    db.resaleListing.groupBy({ by: ["eventId", "status"], where: { event: { organizationId } }, _count: { _all: true }, _sum: { priceMinor: true } }),
    db.resaleListing.findMany({
      where: { event: { organizationId } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        event: { select: { id: true, title: true, timezone: true } },
        ticket: { select: { shortCode: true, ticketType: { select: { name: true } } } },
      },
    }),
    db.event.findMany({
      where: { organizationId, OR: [{ resaleListings: { some: {} } }, { status: "PUBLISHED", startsAt: { gte: now } }] },
      select: { id: true, title: true, startsAt: true, timezone: true, status: true, resaleEnabled: true, resaleCutoffMinutes: true },
      orderBy: { startsAt: "desc" },
      take: 30,
    }),
  ]);
  const totals = { open: 0, sold: 0, amountMinor: 0, failed: 0 };
  const perEvent = new Map<string, { open: number; sold: number }>();
  for (const g of grouped) {
    const n = g._count._all;
    const row = perEvent.get(g.eventId) ?? { open: 0, sold: 0 };
    if (g.status === "ACTIVE" || g.status === "RESERVED") {
      totals.open += n;
      row.open += n;
    }
    if (g.status === "SOLD") {
      totals.sold += n;
      row.sold += n;
      totals.amountMinor += g._sum.priceMinor ?? 0;
    }
    if (g.status === "FAILED") totals.failed += n;
    perEvent.set(g.eventId, row);
  }
  return { totals, recent, events: events.map((e) => ({ ...e, ...(perEvent.get(e.id) ?? { open: 0, sold: 0 }) })) };
}
