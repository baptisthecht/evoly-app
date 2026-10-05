import "server-only";
import { notify } from "./notifications";
import { assertTransition, checkRefundRequest, CoreError, EVENT_TRANSITIONS, REFUND_APPLICATION_FEE, refundAmount } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { audit } from "./audit";
import { cancelReservation, findOrderIdByToken, orderAccessToken } from "./checkout";
import type { OrgContext } from "./context";
import { sendEmail } from "./email/send";
import { refundEmail } from "./email/templates";
import { emailBrandFor } from "./email/brand";
import { findEvent } from "./events";
import { cancelListingsForEvent, cancelListingsForTicket } from "./resale";
import { cancelCampaignsForEvent } from "./campaigns";

type Reason = "BUYER_REQUEST" | "EVENT_CANCELLED" | "EVENT_CHANGED" | "DUPLICATE" | "FRAUD" | "OTHER";

async function refundableTickets(orderId: string, ticketIds: string[], allowCheckedIn: boolean) {
  const tickets = await db.ticket.findMany({
    where: { orderId, id: { in: ticketIds } },
    include: { refundItems: { include: { refund: { select: { status: true } } } } },
  });
  if (tickets.length !== ticketIds.length || tickets.length === 0) throw new CoreError("NOT_FOUND");
  for (const t of tickets) {
    if (t.status === "CHECKED_IN" && !allowCheckedIn) throw new CoreError("REFUND_TICKET_SCANNED"); // RG-REF-04
    if (t.status !== "VALID" && t.status !== "CHECKED_IN") throw new CoreError("REFUND_TICKET_NOT_REFUNDABLE");
    if (t.refundItems.some((i) => ["REQUESTED", "APPROVED", "PROCESSING"].includes(i.refund.status))) throw new CoreError("REFUND_ALREADY_PENDING");
  }
  return tickets;
}

async function mailBuyer(orderId: string, kind: "PROCESSED" | "REJECTED" | "CANCELLED", amountMinor: number, count: number, message?: string | null) {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { event: { select: { title: true } }, organization: { select: { name: true } } },
  });
  const locale = (o.buyerLocale === "en" ? "en" : "fr") as Locale;
  const brand = await emailBrandFor(o.organizationId);
  const mail = refundEmail({
    brand,
    kind,
    locale,
    organizationName: o.organization.name,
    eventTitle: o.event.title,
    firstName: o.buyerFirstName,
    amount: amountMinor > 0 ? formatMoney(amountMinor, o.currency, locale) : null,
    count,
    message,
  });
  await sendEmail({
    ...mail,
    to: o.buyerEmail,
    template: `refund.${kind.toLowerCase()}`,
    category: "TRANSACTIONAL",
    organizationId: o.organizationId,
    fromName: brand.fromName,
    replyTo: brand.replyTo,
    orderId: o.id,
  }).catch((err) => console.error("e-mail de remboursement", orderId, err));
}

/**
 * Envoi d'un remboursement accepté (RG-REF-02, RG-REF-03) : billets désactivés dès l'envoi, place remise en vente
 * (sauf annulation), remboursement Stripe sans restitution de la commission (RG-FEE-40). Échec : statut FAILED, relançable.
 */
export async function processRefund(refundId: string, options: { notify?: boolean } = {}): Promise<"SUCCEEDED" | "PROCESSING" | "FAILED"> {
  const refund = await db.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: { items: { include: { ticket: { select: { id: true, status: true, ticketTypeId: true, seatId: true } } } }, order: true },
  });
  if (!["APPROVED", "FAILED"].includes(refund.status)) throw new CoreError("REFUND_NOT_APPROVED");
  if (refund.status === "APPROVED") {
    await db.$transaction(async (tx) => {
      for (const item of refund.items) {
        const done =
          await tx.$executeRaw`UPDATE "Ticket" SET status = 'REFUNDED', "voidedAt" = now(), "updatedAt" = now() WHERE id = ${item.ticketId} AND status IN ('VALID', 'CHECKED_IN')`;
        // place remise en vente après un remboursement individuel (sans objet pour une annulation)
        if (done === 1 && refund.reason !== "EVENT_CANCELLED" && item.ticket.status === "VALID")
          await tx.$executeRaw`UPDATE "TicketType" SET "quantitySold" = "quantitySold" - 1 WHERE id = ${item.ticket.ticketTypeId} AND "quantitySold" > 0`;
        // plan de salle : le siège d'un billet remboursé est remis en vente
        if (done === 1 && refund.reason !== "EVENT_CANCELLED" && item.ticket.seatId) {
          await tx.ticket.update({ where: { id: item.ticket.id }, data: { seatId: null } });
          await tx.seat.update({ where: { id: item.ticket.seatId }, data: { status: "AVAILABLE", holdOrderId: null } });
        }
      }
      const live = await tx.ticket.count({ where: { orderId: refund.orderId, status: { in: ["VALID", "CHECKED_IN"] } } });
      await tx.order.update({
        where: { id: refund.orderId },
        data: { refundedMinor: { increment: refund.amountMinor }, status: live === 0 ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });
      await tx.refund.update({ where: { id: refund.id }, data: { status: "PROCESSING", processedAt: new Date() } });
    });
    for (const item of refund.items) await cancelListingsForTicket(item.ticketId);
  }
  let outcome: "SUCCEEDED" | "PROCESSING" | "FAILED" = "SUCCEEDED";
  if (refund.amountMinor > 0) {
    const s = stripe();
    const account = await db.stripeAccount.findUnique({ where: { organizationId: refund.order.organizationId }, select: { stripeAccountId: true } });
    try {
      if (!s || !account || !refund.order.stripePaymentIntentId) throw new Error("paiement introuvable ou Stripe indisponible");
      const r = await s.refunds.create(
        {
          payment_intent: refund.order.stripePaymentIntentId,
          amount: refund.amountMinor,
          refund_application_fee: REFUND_APPLICATION_FEE,
          reason: "requested_by_customer",
          metadata: { refundId: refund.id, orderId: refund.orderId, reason: refund.reason },
        },
        { stripeAccount: account.stripeAccountId, idempotencyKey: `refund:${refund.id}` },
      );
      outcome = r.status === "succeeded" ? "SUCCEEDED" : r.status === "failed" || r.status === "canceled" ? "FAILED" : "PROCESSING";
      await db.refund.update({
        where: { id: refund.id },
        data: { stripeRefundId: r.id, status: outcome, failureReason: outcome === "FAILED" ? (r.failure_reason ?? "échec Stripe") : null },
      });
    } catch (err) {
      outcome = "FAILED";
      // RG-REF-03 et RG-REF-06 : l'organisateur est alerté (onglet Commandes) et peut relancer
      await db.refund.update({
        where: { id: refund.id },
        data: { status: "FAILED", failureReason: String(err instanceof Error ? err.message : err).slice(0, 300) },
      });
      await audit({
        action: "refund.failed",
        organizationId: refund.order.organizationId,
        actorType: "SYSTEM",
        targetType: "Refund",
        targetId: refund.id,
        metadata: { error: String(err).slice(0, 300) },
      });
    }
  } else await db.refund.update({ where: { id: refund.id }, data: { status: "SUCCEEDED" } });
  if (options.notify !== false && outcome !== "FAILED" && refund.status === "APPROVED")
    await mailBuyer(refund.orderId, "PROCESSED", refund.amountMinor, refund.items.length);
  return outcome;
}

/** US-REF-01 : demande de l'acheteur depuis la page de ses billets. Acceptée d'office si la politique le prévoit. */
export async function requestRefund(token: string, ticketIds: string[], message: string | null, now = new Date()) {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) throw new CoreError("ORDER_NOT_FOUND");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { event: true } });
  if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED") throw new CoreError("REFUND_NOT_ALLOWED");
  const check = checkRefundRequest({
    policy: order.event.refundPolicy,
    deadlineAt: order.event.refundDeadlineAt,
    eventStatus: order.event.status,
    eventStartsAt: order.event.startsAt,
    lastMajorChangeAt: order.event.lastMajorChangeAt,
    now,
  });
  if (!check.canRequest) throw new CoreError("REFUND_NOT_ALLOWED");
  const tickets = await refundableTickets(orderId, ticketIds, false);
  // acceptation d'office : politique « toujours » ou « jusqu'à une date limite » dans les délais, changement majeur (RG-EVT-05)
  const automatic =
    !check.outOfDeadline && (check.reason === "EVENT_CHANGED" || order.event.refundPolicy === "ALWAYS" || order.event.refundPolicy === "UNTIL_DEADLINE");
  const refund = await db.refund.create({
    data: {
      orderId,
      status: automatic ? "APPROVED" : "REQUESTED",
      initiator: "BUYER",
      reason: check.reason,
      message: message?.trim().slice(0, 500) || null,
      amountMinor: refundAmount(tickets),
      isOutOfDeadline: check.outOfDeadline,
      handledAt: automatic ? now : null,
      items: { create: tickets.map((t) => ({ ticketId: t.id, amountMinor: t.faceValueMinor })) },
    },
  });
  await audit({
    action: automatic ? "refund.auto_approved" : "refund.requested",
    organizationId: order.organizationId,
    actorType: "SYSTEM",
    targetType: "Refund",
    targetId: refund.id,
    metadata: { via: "buyer_link", tickets: tickets.length },
  });
  if (automatic) await processRefund(refund.id);
  else
    await notify(order.organizationId, "REFUND_REQUESTED", {
      title: order.event.title,
      body: `Demande de remboursement pour la commande ${order.reference}.`,
      link: `/orders/${orderId}`,
    });
  return { refundId: refund.id, automatic };
}

async function ownRefund(ctx: OrgContext, refundId: string) {
  const refund = await db.refund.findFirst({ where: { id: refundId, order: { organizationId: ctx.organization.id } } });
  if (!refund) throw new CoreError("NOT_FOUND");
  return refund;
}

/** US-REF-02 : l'organisateur accepte une demande, avec un message facultatif. */
export async function approveRefund(ctx: OrgContext, refundId: string, responseMessage: string | null) {
  const refund = await ownRefund(ctx, refundId);
  const done = await db.refund.updateMany({
    where: { id: refund.id, status: "REQUESTED" },
    data: { status: "APPROVED", handledById: ctx.user.id, handledAt: new Date(), responseMessage: responseMessage?.trim() || null },
  });
  if (done.count === 0) throw new CoreError("REFUND_NOT_PENDING");
  await audit({
    action: "refund.approved",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Refund",
    targetId: refund.id,
    metadata: { amountMinor: refund.amountMinor },
  });
  return processRefund(refund.id);
}

export async function rejectRefund(ctx: OrgContext, refundId: string, responseMessage: string | null) {
  const refund = await ownRefund(ctx, refundId);
  const done = await db.refund.updateMany({
    where: { id: refund.id, status: "REQUESTED" },
    data: { status: "REJECTED", handledById: ctx.user.id, handledAt: new Date(), responseMessage: responseMessage?.trim() || null },
  });
  if (done.count === 0) throw new CoreError("REFUND_NOT_PENDING");
  await audit({ action: "refund.rejected", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Refund", targetId: refund.id });
  await mailBuyer(refund.orderId, "REJECTED", 0, 0, responseMessage);
}

/** RG-REF-03 : relance d'un remboursement dont l'envoi à Stripe a échoué. */
export async function retryRefund(ctx: OrgContext, refundId: string) {
  const refund = await ownRefund(ctx, refundId);
  if (refund.status !== "FAILED") throw new CoreError("REFUND_NOT_FAILED");
  await audit({ action: "refund.retried", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Refund", targetId: refund.id });
  return processRefund(refund.id);
}

/** US-REF-03 : l'organisateur rembourse une commande ou certains billets à tout moment, billets scannés compris (RG-REF-04). */
export async function refundTickets(ctx: OrgContext, orderId: string, ticketIds: string[], reason: Reason, message: string | null) {
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: ctx.organization.id } });
  if (!order || (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED")) throw new CoreError("REFUND_NOT_ALLOWED");
  const tickets = await refundableTickets(orderId, ticketIds, true);
  const refund = await db.refund.create({
    data: {
      orderId,
      status: "APPROVED",
      initiator: "ORGANIZER",
      reason,
      responseMessage: message?.trim() || null,
      amountMinor: refundAmount(tickets),
      handledById: ctx.user.id,
      handledAt: new Date(),
      items: { create: tickets.map((t) => ({ ticketId: t.id, amountMinor: t.faceValueMinor })) },
    },
  });
  await audit({
    action: "refund.created",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Refund",
    targetId: refund.id,
    metadata: { amountMinor: refund.amountMinor, tickets: tickets.length },
  }); // RG-REF-08
  return processRefund(refund.id);
}

/**
 * RG-REF-07 : annulation d'un événement, après double confirmation. Commandes payées remboursées intégralement,
 * billets gratuits annulés, réservations en cours libérées, annonces de revente retirées, acheteurs prévenus.
 */
export async function cancelEvent(ctx: OrgContext, eventId: string, reason: string, confirmation: string) {
  const event = await findEvent(ctx, eventId);
  if (confirmation.trim() !== event.title.trim()) throw new CoreError("CANCEL_CONFIRMATION_MISMATCH");
  assertTransition(EVENT_TRANSITIONS, event.status, "CANCELLED", "événement");
  await db.event.update({ where: { id: event.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason.trim().slice(0, 500) } });
  await audit({
    action: "event.cancelled",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Event",
    targetId: event.id,
    metadata: { reason },
  });
  await cancelListingsForEvent(event.id);
  await cancelCampaignsForEvent(event.id); // RG-MKT-06
  await notify(ctx.organization.id, "EVENT_CANCELLED", {
    title: event.title,
    body: `Événement annulé : ${reason.trim().slice(0, 200)}`,
    link: `/events/${event.id}`,
  });
  const pending = await db.order.findMany({ where: { eventId, status: "PENDING" }, select: { id: true, accessTokenVersion: true } });
  for (const p of pending) await cancelReservation(orderAccessToken(p.id, p.accessTokenVersion)).catch(() => undefined);
  const orders = await db.order.findMany({
    where: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    include: { tickets: { where: { status: { in: ["VALID", "CHECKED_IN"] } } } },
  });
  let refunded = 0;
  for (const o of orders) {
    if (o.tickets.length === 0) continue;
    const amount = refundAmount(o.tickets);
    if (amount === 0) {
      // billets gratuits : rien à rembourser, les billets sont annulés
      await db.$transaction([
        db.ticket.updateMany({
          where: { orderId: o.id, status: { in: ["VALID", "CHECKED_IN"] } },
          data: { status: "VOID", voidReason: "EVENT_CANCELLED", voidedAt: new Date() },
        }),
        db.order.update({ where: { id: o.id }, data: { status: "REFUNDED" } }),
      ]);
    } else {
      const refund = await db.refund.create({
        data: {
          orderId: o.id,
          status: "APPROVED",
          initiator: "SYSTEM",
          reason: "EVENT_CANCELLED",
          amountMinor: amount,
          handledById: ctx.user.id,
          handledAt: new Date(),
          items: { create: o.tickets.map((t) => ({ ticketId: t.id, amountMinor: t.faceValueMinor })) },
        },
      });
      await processRefund(refund.id, { notify: false });
      refunded += 1;
    }
    await mailBuyer(o.id, "CANCELLED", amount, o.tickets.length, reason);
  }
  return { orders: orders.length, refunded };
}

/** État des remboursements Stripe reçu par webhook (`charge.refund.updated`). */
export async function syncStripeRefund(stripeRefundId: string, status: string, failureReason?: string | null) {
  const refund = await db.refund.findUnique({ where: { stripeRefundId } });
  if (!refund) return false;
  const next = status === "succeeded" ? "SUCCEEDED" : status === "failed" || status === "canceled" ? "FAILED" : "PROCESSING";
  await db.refund.update({ where: { id: refund.id }, data: { status: next, failureReason: next === "FAILED" ? (failureReason ?? "échec Stripe") : null } });
  return true;
}
