"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import { revalidatePath } from "next/cache";
import { stripe } from "@/lib/stripe";
import { createNotification } from "@/lib/notifications";
import { resend, FROM_EMAIL } from "@/lib/resend";

// Buyer creates a refund request
export async function createRefundRequestAction(
  orderId: string,
  ticketIds: string[],
  reason: string | null,
  isOutOfDeadline: boolean
) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, eventId: true },
  });
  if (!order || order.status !== "COMPLETED") return { error: "Commande introuvable." };
  if (ticketIds.length === 0) return { error: "Sélectionnez au moins un billet." };

  // Validate tickets belong to order
  const tickets = await db.ticket.findMany({
    where: { id: { in: ticketIds }, orderId, status: "ACTIVE" },
  });
  if (tickets.length !== ticketIds.length) return { error: "Billets invalides." };

  await db.refundRequest.create({
    data: { orderId, ticketIds, reason, isOutOfDeadline, status: "PENDING" },
  });

  // Notify organizer in-app
  const event = await db.event.findUnique({
    where: { id: order.eventId },
    select: { organizationId: true, slug: true, title: true, organization: { select: { slug: true } } },
  });
  if (event) {
    await createNotification({
      organizationId: event.organizationId,
      type: "REFUND_REQUEST",
      title: "Demande de remboursement",
      message: `Une demande de remboursement a été soumise pour ${ticketIds.length} billet(s) — ${event.title}`,
      link: `/dashboard/${event.organization.slug}/events/${event.slug}/orders`,
    });
  }

  return { success: true };
}

// Organizer approves a refund request
export async function approveRefundAction(
  refundRequestId: string,
  organizationId: string,
  responseMessage?: string
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };
  await requirePermission(session.user.id, organizationId, "TICKETS_REFUND");

  const refund = await db.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: {
      order: {
        include: {
          event: { select: { title: true, organizationId: true } },
          tickets: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  if (!refund) return { error: "Demande introuvable." };
  if (refund.order.event.organizationId !== organizationId) return { error: "Non autorisé." };
  if (refund.status !== "PENDING") return { error: "Cette demande a déjà été traitée." };

  const order = refund.order;

  // Process Stripe refund if paid order
  if (order.stripePaymentIntentId) {
    try {
      // Calculate refund amount proportional to tickets selected
      const ticketCount = order.tickets.length;
      const selectedCount = refund.ticketIds.length;
      const refundAmount = Math.round((order.totalCents - order.feesCents) * (selectedCount / ticketCount));

      await stripe.refunds.create({
        payment_intent: order.stripePaymentIntentId,
        amount: refundAmount,
        reason: "requested_by_customer",
      });
    } catch (err: any) {
      return { error: `Erreur Stripe : ${err.message}` };
    }
  }

  // Update tickets status
  await db.$transaction([
    db.ticket.updateMany({
      where: { id: { in: refund.ticketIds } },
      data: { status: "REFUNDED" },
    }),
    db.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        status: "PROCESSED",
        responseMessage: responseMessage ?? null,
        respondedAt: new Date(),
        respondedBy: session.user.id,
      },
    }),
    db.order.update({
      where: { id: order.id },
      data: {
        status: refund.ticketIds.length === order.tickets.length ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
    }),
  ]);

  // Email buyer
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: order.buyerEmail,
      subject: `Remboursement approuvé — ${order.event.title}`,
      html: `<p>Bonjour ${order.buyerFirstName},</p>
        <p>Votre demande de remboursement pour <strong>${order.event.title}</strong> a été approuvée.</p>
        ${responseMessage ? `<p>Message de l'organisateur : ${responseMessage}</p>` : ""}
        <p>Le remboursement apparaîtra sur votre compte bancaire sous 5-10 jours ouvrés.</p>
        <p style="font-size:12px;color:#9ca3af">Les frais de commission Evoly et Stripe ne sont pas remboursés.</p>`,
    });
  } catch (e) {
    console.error("[approveRefundAction] Email error:", e);
  }

  revalidatePath(`/dashboard`);
  return { success: true };
}

// Organizer rejects a refund request
export async function rejectRefundAction(
  refundRequestId: string,
  organizationId: string,
  responseMessage: string
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };
  await requirePermission(session.user.id, organizationId, "TICKETS_REFUND");

  const refund = await db.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: { order: { select: { buyerEmail: true, buyerFirstName: true, event: { select: { title: true, organizationId: true } } } } },
  });

  if (!refund) return { error: "Demande introuvable." };
  if (refund.order.event.organizationId !== organizationId) return { error: "Non autorisé." };
  if (refund.status !== "PENDING") return { error: "Cette demande a déjà été traitée." };

  await db.refundRequest.update({
    where: { id: refundRequestId },
    data: {
      status: "REJECTED",
      responseMessage,
      respondedAt: new Date(),
      respondedBy: session.user.id,
    },
  });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: refund.order.buyerEmail,
      subject: `Remboursement refusé — ${refund.order.event.title}`,
      html: `<p>Bonjour ${refund.order.buyerFirstName},</p>
        <p>Votre demande de remboursement pour <strong>${refund.order.event.title}</strong> a été refusée.</p>
        ${responseMessage ? `<p>Motif : ${responseMessage}</p>` : ""}`,
    });
  } catch (e) {
    console.error("[rejectRefundAction] Email error:", e);
  }

  revalidatePath(`/dashboard`);
  return { success: true };
}
