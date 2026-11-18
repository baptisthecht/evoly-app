import "server-only";
import { notify } from "./notifications";
import {
  assertTransition,
  checkRefundRequest,
  CoreError,
  EVENT_TRANSITIONS,
  refundAmount,
  buyerBearsRefundFees,
  estimateBankFee,
  refundFeesWithheld,
  type RefundFeeMode,
} from "@evoly/core";
import { formatMoney, type Locale, toLocale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { createMollieRefund, refundStatusFromMollie } from "./molliePayments";
import {
  cancelReservation,
  findOrderIdByToken,
  orderAccessToken,
} from "./checkout";
import type { OrgContext } from "./context";
import { sendEmail } from "./email/send";
import { refundEmail } from "./email/templates";
import { emailBrandFor } from "./email/brand";
import { findEvent } from "./events";
import { cancelListingsForEvent, cancelListingsForTicket } from "./resale";
import { cancelCampaignsForEvent } from "./campaigns";
import { safeError } from "@/lib/redact";

type Reason =
  | "BUYER_REQUEST"
  | "EVENT_CANCELLED"
  | "EVENT_CHANGED"
  | "DUPLICATE"
  | "FRAUD"
  | "OTHER";

async function refundableTickets(
  orderId: string,
  ticketIds: string[],
  allowCheckedIn: boolean,
) {
  const tickets = await db.ticket.findMany({
    where: { orderId, id: { in: ticketIds } },
    include: {
      refundItems: { include: { refund: { select: { status: true } } } },
    },
  });
  if (tickets.length !== ticketIds.length || tickets.length === 0)
    throw new CoreError("NOT_FOUND");
  for (const t of tickets) {
    if (t.status === "CHECKED_IN" && !allowCheckedIn)
      throw new CoreError("REFUND_TICKET_SCANNED"); // RG-REF-04
    if (t.status !== "VALID" && t.status !== "CHECKED_IN")
      throw new CoreError("REFUND_TICKET_NOT_REFUNDABLE");
    if (
      t.refundItems.some((i) =>
        ["REQUESTED", "APPROVED", "PROCESSING"].includes(i.refund.status),
      )
    )
      throw new CoreError("REFUND_ALREADY_PENDING");
  }
  return tickets;
}

async function mailBuyer(
  orderId: string,
  kind: "PROCESSED" | "REJECTED" | "CANCELLED",
  amountMinor: number,
  count: number,
  message?: string | null,
) {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      event: { select: { title: true } },
      organization: { select: { name: true } },
    },
  });
  const locale = toLocale(o.buyerLocale); // e-mails de remboursement dans les 7 langues
  const brand = await emailBrandFor(o.organizationId);
  const mail = refundEmail({
    brand,
    kind,
    locale,
    organizationName: o.organization.name,
    eventTitle: o.event.title,
    firstName: o.buyerFirstName,
    amount:
      amountMinor > 0 ? formatMoney(amountMinor, o.currency, locale) : null,
    count,
    message,
  });
  await sendEmail({
    locale,
    ...mail,
    to: o.buyerEmail,
    template: `refund.${kind.toLowerCase()}`,
    category: "TRANSACTIONAL",
    organizationId: o.organizationId,
    fromName: brand.fromName,
    replyTo: brand.replyTo,
    orderId: o.id,
  }).catch((err) =>
    console.error("e-mail de remboursement", orderId, safeError(err)),
  );
}

/**
 * Remboursement à coût neutre (RG-REF-09, RG-REF-10) : frais retenus sur un remboursement demandé par l'acheteur quand
 * la commande a été passée en mode « moins les frais » : frais de paiement (réels, ou estimés tant
 * qu'ils ne sont pas connus) et commission d'Evoly, au prorata du montant, jamais plus que ce qui reste à retenir sur la commande.
 */
async function feesToWithhold(
  order: {
    id: string;
    refundFeeMode: RefundFeeMode;
    totalMinor: number;
    applicationFeeMinor: number;
    paymentFeeMinor: number | null;
  },
  grossMinor: number,
): Promise<number> {
  if (order.refundFeeMode !== "MINUS_FEES") return 0;
  const already = await db.refund.aggregate({
    where: { orderId: order.id, status: { not: "REJECTED" } },
    _sum: { feesWithheldMinor: true },
  });
  return refundFeesWithheld({
    mode: order.refundFeeMode,
    grossMinor,
    orderTotalMinor: order.totalMinor,
    applicationFeeMinor: order.applicationFeeMinor,
    paymentFeeMinor:
      order.paymentFeeMinor ??
      estimateBankFee(order.totalMinor, "card_eea_standard"),
    alreadyWithheldMinor: already._sum.feesWithheldMinor ?? 0,
  });
}

/**
 * Envoi d'un remboursement accepté (RG-REF-02, RG-REF-03) : billets désactivés dès l'envoi, place remise en vente
 * (sauf annulation), remboursement Mollie sur le solde de l'organisateur, sans restitution de la commission (RG-FEE-40).
 * Échec : statut FAILED, relançable.
 */
export async function processRefund(
  refundId: string,
  options: { notify?: boolean } = {},
): Promise<"SUCCEEDED" | "PROCESSING" | "FAILED"> {
  const refund = await db.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: {
      items: {
        include: {
          ticket: {
            select: {
              id: true,
              status: true,
              ticketTypeId: true,
              seatId: true,
            },
          },
        },
      },
      optionItems: true,
      order: true,
    },
  });
  if (!["APPROVED", "FAILED"].includes(refund.status))
    throw new CoreError("REFUND_NOT_APPROVED");
  let extra = 0; // options non retirées ajoutées quand plus aucun billet n'est valide (RG-OPT-07)
  let extraWithheld = 0; // leur part des frais, si l'acheteur les supporte (RG-REF-10)
  if (refund.status === "APPROVED") {
    await db.$transaction(async (tx) => {
      for (const item of refund.items) {
        const done =
          await tx.$executeRaw`UPDATE "Ticket" SET status = 'REFUNDED', "voidedAt" = now(), "updatedAt" = now() WHERE id = ${item.ticketId} AND status IN ('VALID', 'CHECKED_IN')`;
        // place remise en vente après un remboursement individuel (sans objet pour une annulation)
        if (
          done === 1 &&
          refund.reason !== "EVENT_CANCELLED" &&
          item.ticket.status === "VALID"
        )
          await tx.$executeRaw`UPDATE "TicketType" SET "quantitySold" = "quantitySold" - 1 WHERE id = ${item.ticket.ticketTypeId} AND "quantitySold" > 0`;
        // plan de salle : le siège d'un billet remboursé est remis en vente
        if (
          done === 1 &&
          refund.reason !== "EVENT_CANCELLED" &&
          item.ticket.seatId
        ) {
          await tx.ticket.update({
            where: { id: item.ticket.id },
            data: { seatId: null },
          });
          await tx.seat.update({
            where: { id: item.ticket.seatId },
            data: { status: "AVAILABLE", holdOrderId: null },
          });
        }
      }
      // options remboursées explicitement (RG-OPT-07) : jamais au-delà de ce qui n'a été ni retiré ni remboursé
      for (const it of refund.optionItems) {
        const ok =
          await tx.$executeRaw`UPDATE "OrderOption" SET "refunded" = "refunded" + ${it.quantity} WHERE id = ${it.orderOptionId} AND "redeemed" + "refunded" + ${it.quantity} <= "quantity"`;
        if (ok !== 1) throw new CoreError("OPTION_NOT_REFUNDABLE");
      }
      const live = await tx.ticket.count({
        where: {
          orderId: refund.orderId,
          status: { in: ["VALID", "CHECKED_IN"] },
        },
      });
      const everTickets = await tx.ticket.count({
        where: { orderId: refund.orderId },
      }); // 0 : options achetées seules (RG-OPT-03)
      // plus aucun billet valide (tous remboursés, événement annulé) : les options non retirées sont remboursées avec eux (RG-OPT-07)
      if (live === 0 && everTickets > 0) {
        const lines = await tx.orderOption.findMany({
          where: { orderId: refund.orderId },
          select: {
            id: true,
            quantity: true,
            redeemed: true,
            refunded: true,
            unitPriceMinor: true,
          },
        });
        for (const l of lines) {
          const left = l.quantity - l.redeemed - l.refunded;
          if (left <= 0) continue;
          const ok =
            await tx.$executeRaw`UPDATE "OrderOption" SET "refunded" = "refunded" + ${left} WHERE id = ${l.id} AND "redeemed" + "refunded" + ${left} <= "quantity"`;
          if (ok !== 1) continue;
          await tx.refundOptionItem.create({
            data: {
              refundId: refund.id,
              orderOptionId: l.id,
              quantity: left,
              amountMinor: left * l.unitPriceMinor,
            },
          });
          extra += left * l.unitPriceMinor;
        }
        if (extra) {
          extraWithheld = buyerBearsRefundFees(refund)
            ? await feesToWithhold(refund.order, extra)
            : 0;
          await tx.refund.update({
            where: { id: refund.id },
            data: {
              amountMinor: { increment: extra - extraWithheld },
              feesWithheldMinor: { increment: extraWithheld },
            },
          });
        }
      }
      await tx.order.update({
        where: { id: refund.orderId },
        data: {
          refundedMinor: {
            increment: refund.amountMinor + extra - extraWithheld,
          },
          // options seules : remboursée quand toutes ses options l'ont été
          status: (
            everTickets > 0
              ? live === 0
              : (
                  await tx.orderOption.findMany({
                    where: { orderId: refund.orderId },
                    select: { quantity: true, refunded: true },
                  })
                ).every((l) => l.refunded >= l.quantity)
          )
            ? "REFUNDED"
            : "PARTIALLY_REFUNDED",
        },
      });
      await tx.refund.update({
        where: { id: refund.id },
        data: { status: "PROCESSING", processedAt: new Date() },
      });
    });
    for (const item of refund.items)
      await cancelListingsForTicket(item.ticketId);
  }
  const amount = refund.amountMinor + extra - extraWithheld;
  let outcome: "SUCCEEDED" | "PROCESSING" | "FAILED" = "SUCCEEDED";
  // RG-POS-08 : une vente sur place en espèces se rembourse en espèces, hors d'Evoly ; aucun appel au prestataire
  if (amount > 0 && refund.order.boxOfficeMode !== "CASH") {
    try {
      if (!refund.order.molliePaymentId)
        throw new Error("paiement en ligne introuvable");
      // Mollie (docs/MOLLIE.md) : sur le solde de l'organisateur ; Mollie ne rend jamais la commission d'Evoly
      const r = await createMollieRefund({
        orderId: refund.orderId,
        amountMinor: amount,
        description: `Remboursement ${refund.order.reference}`,
        metadata: {
          refundId: refund.id,
          orderId: refund.orderId,
          reason: refund.reason,
        },
        idempotencyKey: `refund:${refund.id}`,
      });
      outcome = refundStatusFromMollie(r.status);
      await db.refund.update({
        where: { id: refund.id },
        data: {
          mollieRefundId: r.id,
          status: outcome,
          failureReason: outcome === "FAILED" ? "échec Mollie" : null,
        },
      });
    } catch (err) {
      outcome = "FAILED";
      // RG-REF-03 et RG-REF-06 : l'organisateur est alerté (onglet Commandes) et peut relancer
      await db.refund.update({
        where: { id: refund.id },
        data: {
          status: "FAILED",
          failureReason: String(err instanceof Error ? err.message : err).slice(
            0,
            300,
          ),
        },
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
  } else
    await db.refund.update({
      where: { id: refund.id },
      data: { status: "SUCCEEDED" },
    });
  if (
    options.notify !== false &&
    outcome !== "FAILED" &&
    refund.status === "APPROVED"
  )
    await mailBuyer(refund.orderId, "PROCESSED", amount, refund.items.length);
  return outcome;
}

/** US-REF-01 : demande de l'acheteur depuis la page de ses billets. Acceptée d'office si la politique le prévoit. */
export async function requestRefund(
  token: string,
  ticketIds: string[],
  message: string | null,
  now = new Date(),
) {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) throw new CoreError("ORDER_NOT_FOUND");
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { event: true },
  });
  if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED")
    throw new CoreError("REFUND_NOT_ALLOWED");
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
  // RG-REF-09 : en mode « moins les frais », l'acheteur qui demande pour son propre motif supporte les frais, au
  // prorata ; un changement de date ou de lieu n'est pas de son fait : remboursé en entier
  const gross = refundAmount(tickets);
  const withheld = buyerBearsRefundFees({
    initiator: "BUYER",
    reason: check.reason,
  })
    ? await feesToWithhold(order, gross)
    : 0;
  // acceptation d'office : politique « toujours » ou « jusqu'à une date limite » dans les délais, changement majeur (RG-EVT-05)
  const automatic =
    !check.outOfDeadline &&
    (check.reason === "EVENT_CHANGED" ||
      order.event.refundPolicy === "ALWAYS" ||
      order.event.refundPolicy === "UNTIL_DEADLINE");
  const refund = await db.refund.create({
    data: {
      orderId,
      status: automatic ? "APPROVED" : "REQUESTED",
      initiator: "BUYER",
      reason: check.reason,
      message: message?.trim().slice(0, 500) || null,
      amountMinor: gross - withheld,
      feesWithheldMinor: withheld,
      isOutOfDeadline: check.outOfDeadline,
      handledAt: automatic ? now : null,
      items: {
        create: tickets.map((t) => ({
          ticketId: t.id,
          amountMinor: t.faceValueMinor,
        })),
      },
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
  const refund = await db.refund.findFirst({
    where: { id: refundId, order: { organizationId: ctx.organization.id } },
  });
  if (!refund) throw new CoreError("NOT_FOUND");
  return refund;
}

/** US-REF-02 : l'organisateur accepte une demande, avec un message facultatif. */
export async function approveRefund(
  ctx: OrgContext,
  refundId: string,
  responseMessage: string | null,
) {
  const refund = await ownRefund(ctx, refundId);
  const done = await db.refund.updateMany({
    where: { id: refund.id, status: "REQUESTED" },
    data: {
      status: "APPROVED",
      handledById: ctx.user.id,
      handledAt: new Date(),
      responseMessage: responseMessage?.trim() || null,
    },
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

export async function rejectRefund(
  ctx: OrgContext,
  refundId: string,
  responseMessage: string | null,
) {
  const refund = await ownRefund(ctx, refundId);
  const done = await db.refund.updateMany({
    where: { id: refund.id, status: "REQUESTED" },
    data: {
      status: "REJECTED",
      handledById: ctx.user.id,
      handledAt: new Date(),
      responseMessage: responseMessage?.trim() || null,
    },
  });
  if (done.count === 0) throw new CoreError("REFUND_NOT_PENDING");
  await audit({
    action: "refund.rejected",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Refund",
    targetId: refund.id,
  });
  await mailBuyer(refund.orderId, "REJECTED", 0, 0, responseMessage);
}

/** RG-REF-03 : relance d'un remboursement dont l'envoi à Mollie a échoué. */
export async function retryRefund(ctx: OrgContext, refundId: string) {
  const refund = await ownRefund(ctx, refundId);
  if (refund.status !== "FAILED") throw new CoreError("REFUND_NOT_FAILED");
  await audit({
    action: "refund.retried",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Refund",
    targetId: refund.id,
  });
  return processRefund(refund.id);
}

/** US-REF-03 : l'organisateur rembourse une commande ou certains billets à tout moment, billets scannés compris (RG-REF-04). */
export async function refundTickets(
  ctx: OrgContext,
  orderId: string,
  ticketIds: string[],
  reason: Reason,
  message: string | null,
) {
  const order = await db.order.findFirst({
    where: { id: orderId, organizationId: ctx.organization.id },
  });
  if (
    !order ||
    (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED")
  )
    throw new CoreError("REFUND_NOT_ALLOWED");
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
      items: {
        create: tickets.map((t) => ({
          ticketId: t.id,
          amountMinor: t.faceValueMinor,
        })),
      },
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
 * RG-OPT-07 : rembourser des options non retirées, jusqu'au début de l'événement ; après, seulement si l'organisateur
 * l'autorise sur l'événement. Une option remboursée ne peut plus être retirée au bar ; la commission d'Evoly n'est pas rendue.
 */
export async function refundOptions(
  ctx: OrgContext,
  orderId: string,
  lines: { orderOptionId: string; quantity: number }[],
  message: string | null,
  now = new Date(),
) {
  const order = await db.order.findFirst({
    where: { id: orderId, organizationId: ctx.organization.id },
    include: {
      event: { select: { startsAt: true, optionsRefundAfterStart: true } },
      options: true,
    },
  });
  if (
    !order ||
    (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED")
  )
    throw new CoreError("REFUND_NOT_ALLOWED");
  if (now >= order.event.startsAt && !order.event.optionsRefundAfterStart)
    throw new CoreError("OPTIONS_REFUND_CLOSED");
  const wanted = lines.filter((l) => l.quantity !== 0);
  if (wanted.length === 0) throw new CoreError("OPTION_NOT_REFUNDABLE");
  const items = wanted.map((l) => {
    const o = order.options.find((x) => x.id === l.orderOptionId);
    if (
      !o ||
      !Number.isInteger(l.quantity) ||
      l.quantity < 1 ||
      l.quantity > o.quantity - o.redeemed - o.refunded
    )
      throw new CoreError("OPTION_NOT_REFUNDABLE");
    return {
      orderOptionId: o.id,
      quantity: l.quantity,
      amountMinor: l.quantity * o.unitPriceMinor,
    };
  });
  const refund = await db.refund.create({
    data: {
      orderId,
      status: "APPROVED",
      initiator: "ORGANIZER",
      reason: "OTHER",
      responseMessage: message?.trim() || null,
      amountMinor: items.reduce((n, i) => n + i.amountMinor, 0),
      handledById: ctx.user.id,
      handledAt: now,
      optionItems: { create: items },
    },
  });
  await audit({
    action: "refund.created",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Refund",
    targetId: refund.id,
    metadata: {
      amountMinor: refund.amountMinor,
      options: items.reduce((n, i) => n + i.quantity, 0),
    },
  });
  return processRefund(refund.id);
}

/**
 * RG-REF-07 : annulation d'un événement, après double confirmation. Commandes payées remboursées intégralement,
 * billets gratuits annulés, réservations en cours libérées, annonces de revente retirées, acheteurs prévenus.
 */
export async function cancelEvent(
  ctx: OrgContext,
  eventId: string,
  reason: string,
  confirmation: string,
) {
  const event = await findEvent(ctx, eventId);
  if (confirmation.trim() !== event.title.trim())
    throw new CoreError("CANCEL_CONFIRMATION_MISMATCH");
  assertTransition(EVENT_TRANSITIONS, event.status, "CANCELLED", "événement");
  await db.event.update({
    where: { id: event.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: reason.trim().slice(0, 500),
    },
  });
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
  const pending = await db.order.findMany({
    where: { eventId, status: "PENDING" },
    select: { id: true, accessTokenVersion: true },
  });
  for (const p of pending)
    await cancelReservation(orderAccessToken(p.id, p.accessTokenVersion)).catch(
      () => undefined,
    );
  const orders = await db.order.findMany({
    where: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    include: {
      tickets: { where: { status: { in: ["VALID", "CHECKED_IN"] } } },
    },
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
          data: {
            status: "VOID",
            voidReason: "EVENT_CANCELLED",
            voidedAt: new Date(),
          },
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
          items: {
            create: o.tickets.map((t) => ({
              ticketId: t.id,
              amountMinor: t.faceValueMinor,
            })),
          },
        },
      });
      await processRefund(refund.id, { notify: false });
      refunded += 1;
    }
    await mailBuyer(o.id, "CANCELLED", amount, o.tickets.length, reason);
  }
  return { orders: orders.length, refunded };
}
