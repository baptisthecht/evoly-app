"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { requirePermission } from "@evoly/core/organizers";
import { revalidatePath } from "next/cache";

// ─────────────────────────────────────────
// PAYOUT — Demander un virement
// ─────────────────────────────────────────

export async function requestPayoutAction(organizationId: string, amountCents: number) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "FINANCE_MANAGE");

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { stripeAccountId: true, stripeAccountStatus: true, availableBalanceCents: true },
  });

  if (!org) return { error: "Organisation introuvable." };
  if (!org.stripeAccountId || org.stripeAccountStatus !== "ACTIVE") {
    return { error: "Compte Stripe non connecté ou non vérifié." };
  }
  if (amountCents < 100) return { error: "Montant minimum : 1€." };
  if (amountCents > org.availableBalanceCents) {
    return { error: "Solde insuffisant." };
  }

  // Create payout record
  const payout = await db.payout.create({
    data: {
      organizationId,
      amountCents,
      status: "PENDING",
    },
  });

  // Deduct from available balance immediately
  await db.organization.update({
    where: { id: organizationId },
    data: { availableBalanceCents: { decrement: amountCents } },
  });

  try {
    // Transfer from Evoly platform to Connect account
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "eur",
      destination: org.stripeAccountId,
      metadata: { payoutId: payout.id, organizationId },
    });

    await db.payout.update({
      where: { id: payout.id },
      data: { stripePayoutId: transfer.id },
    });
  } catch (err: any) {
    // Revert on Stripe error
    await db.payout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: err.message } });
    await db.organization.update({
      where: { id: organizationId },
      data: { availableBalanceCents: { increment: amountCents } },
    });
    return { error: "Échec du virement : " + err.message };
  }

  revalidatePath(`/dashboard`);
  return { success: true, payoutId: payout.id };
}

// ─────────────────────────────────────────
// REFUND — Approuver une demande
// ─────────────────────────────────────────

export async function approveRefundAction(refundRequestId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "TICKETS_REFUND");

  const refundRequest = await db.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: { order: true },
  });

  if (!refundRequest) return { error: "Demande introuvable." };
  if (refundRequest.status !== "PENDING") return { error: "Cette demande a déjà été traitée." };

  const order = refundRequest.order;

  // Process Stripe refund if payment was made
  if (order.stripePaymentIntentId && order.totalCents > 0) {
    try {
      await stripe.refunds.create({
        payment_intent: order.stripePaymentIntentId,
        // Note: Evoly keeps its commission (only refund ticket amount minus fees)
        amount: order.totalCents - order.feesCents,
      });
    } catch (err: any) {
      return { error: "Échec du remboursement Stripe : " + err.message };
    }
  }

  // Update DB in transaction
  await db.$transaction(async (tx) => {
    // Invalidate tickets
    await tx.ticket.updateMany({
      where: { id: { in: refundRequest.ticketIds }, orderId: order.id },
      data: { status: "REFUNDED" },
    });

    // Update order status
    const allTickets = await tx.ticket.findMany({ where: { orderId: order.id } });
    const allRefunded = allTickets.every((t) => t.status === "REFUNDED" || t.id === refundRequest.ticketIds[0]);
    await tx.order.update({
      where: { id: order.id },
      data: { status: allRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });

    // Update refund request
    await tx.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        status: "PROCESSED",
        respondedAt: new Date(),
        respondedBy: session.user!.id,
      },
    });
  });

  return { success: true };
}

export async function rejectRefundAction(
  refundRequestId: string,
  organizationId: string,
  message?: string
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "TICKETS_REFUND");

  await db.refundRequest.update({
    where: { id: refundRequestId },
    data: {
      status: "REJECTED",
      responseMessage: message ?? null,
      respondedAt: new Date(),
      respondedBy: session.user.id,
    },
  });

  return { success: true };
}

// ─────────────────────────────────────────
// REFUND REQUEST — De l'acheteur
// ─────────────────────────────────────────

export async function createRefundRequestAction(
  orderId: string,
  ticketIds: string[],
  reason?: string
) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      event: { select: { refundPolicy: true, refundDeadlineDays: true, startsAt: true } },
    },
  });
  if (!order) return { error: "Commande introuvable." };
  if (order.status === "REFUNDED") return { error: "Cette commande a déjà été remboursée." };

  const now = new Date();
  let isOutOfDeadline = false;

  if (order.event.refundPolicy === "NON_REFUNDABLE") {
    isOutOfDeadline = true;
  } else if (order.event.refundPolicy === "ORGANIZER_DEFINED" && order.event.refundDeadlineDays) {
    const deadline = new Date(order.event.startsAt);
    deadline.setDate(deadline.getDate() - order.event.refundDeadlineDays);
    if (now > deadline) isOutOfDeadline = true;
  }

  const existing = await db.refundRequest.findFirst({
    where: { orderId, status: "PENDING" },
  });
  if (existing) return { error: "Une demande est déjà en cours pour cette commande." };

  await db.refundRequest.create({
    data: {
      orderId,
      ticketIds,
      reason: reason ?? null,
      isOutOfDeadline,
      status: "PENDING",
    },
  });

  return { success: true, isOutOfDeadline };
}
