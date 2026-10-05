import "server-only";
import { CoreError, normalizeShortCode, sha256Hex } from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { orderAccessToken } from "./checkout";
import type { OrgContext } from "./context";
import { sendOrderConfirmation } from "./orders";

export type OrderFilter = "ALL" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" | "REFUND_REQUESTED" | "REFUND_FAILED";

/** US-ORD-01 : recherche par nom, e-mail, référence ou code de billet, filtres par statut et par événement. */
export async function searchOrders(ctx: OrgContext, opts: { q?: string; eventId?: string; ticketTypeId?: string; filter?: OrderFilter; page?: number }) {
  const q = opts.q?.trim() ?? "";
  const where: Prisma.OrderWhereInput = {
    organizationId: ctx.organization.id,
    status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED"] },
    ...(opts.eventId ? { eventId: opts.eventId } : {}),
    ...(opts.ticketTypeId ? { items: { some: { ticketTypeId: opts.ticketTypeId } } } : {}),
    ...(opts.filter === "PAID" || opts.filter === "PARTIALLY_REFUNDED" || opts.filter === "REFUNDED" ? { status: opts.filter } : {}),
    ...(opts.filter === "REFUND_REQUESTED" ? { refunds: { some: { status: "REQUESTED" } } } : {}),
    ...(opts.filter === "REFUND_FAILED" ? { refunds: { some: { status: "FAILED" } } } : {}),
    ...(q
      ? {
          OR: [
            { buyerEmail: { contains: q, mode: "insensitive" } },
            { buyerFirstName: { contains: q, mode: "insensitive" } },
            { buyerLastName: { contains: q, mode: "insensitive" } },
            { reference: { contains: q.toUpperCase() } },
            { tickets: { some: { shortCode: normalizeShortCode(q) } } },
            ...(q.includes(" ")
              ? [
                  {
                    AND: [
                      { buyerFirstName: { contains: q.split(" ")[0], mode: "insensitive" as const } },
                      { buyerLastName: { contains: q.split(" ").slice(1).join(" "), mode: "insensitive" as const } },
                    ],
                  },
                ]
              : []),
          ],
        }
      : {}),
  };
  const page = Math.max(0, opts.page ?? 0);
  const [rows, total, pendingRequests] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: page * 50,
      include: {
        event: { select: { title: true } },
        _count: { select: { tickets: true } },
        refunds: { where: { status: { in: ["REQUESTED", "FAILED"] } }, select: { status: true } },
      },
    }),
    db.order.count({ where }),
    db.refund.count({ where: { status: "REQUESTED", order: { organizationId: ctx.organization.id } } }),
  ]);
  return { rows, total, pendingRequests, pages: Math.ceil(total / 50) };
}

/** RG-ORD-01 : détail complet d'une commande. */
export async function getOrderDetail(ctx: OrgContext, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, organizationId: ctx.organization.id },
    include: {
      event: true,
      promoCode: { select: { code: true } },
      items: { include: { ticketType: { select: { name: true } }, priceTier: { select: { name: true } } } },
      tickets: {
        include: {
          ticketType: { select: { name: true } },
          seat: { select: { label: true, row: { select: { name: true } } } },
          checkIns: { where: { result: "VALID" }, orderBy: { scannedAt: "asc" }, take: 1 },
          refundItems: { select: { refund: { select: { status: true } } } },
        },
        orderBy: [{ ticketTypeId: "asc" }, { createdAt: "asc" }],
      },
      refunds: {
        include: { items: { include: { ticket: { select: { shortCode: true } } } }, handledBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      soldListings: { orderBy: { createdAt: "desc" } },
      emailMessages: { orderBy: { queuedAt: "desc" }, take: 30 },
      answers: { include: { question: { select: { label: true, sortOrder: true } } }, orderBy: { question: { sortOrder: "asc" } } },
    },
  });
  if (!order) throw new CoreError("NOT_FOUND");
  return order;
}

/** US-ORD-02 : renvoi des billets à l'acheteur. */
export async function resendTickets(ctx: OrgContext, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: ctx.organization.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } });
  if (!order) throw new CoreError("NOT_FOUND");
  await sendOrderConfirmation(order.id);
  await audit({ action: "order.tickets_resent", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Order", targetId: order.id });
}

/** RG-ORD-02 : nouvelle adresse, nouveau lien magique ; l'ancien lien est invalidé (version du jeton incrémentée). */
export async function correctBuyerEmail(ctx: OrgContext, orderId: string, email: string) {
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: ctx.organization.id } });
  if (!order) throw new CoreError("NOT_FOUND");
  const next = email.trim().toLowerCase();
  const version = order.accessTokenVersion + 1;
  await db.order.update({
    where: { id: order.id },
    data: { buyerEmail: next, accessTokenVersion: version, accessTokenHash: await sha256Hex(orderAccessToken(order.id, version)) },
  });
  await audit({
    action: "order.email_corrected",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Order",
    targetId: order.id,
    metadata: { from: order.buyerEmail, to: next },
  });
  if (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") await sendOrderConfirmation(order.id);
}

/** US-ORD-02 : correction du nom d'un titulaire par l'organisateur. */
export async function updateHolderByOrganizer(ctx: OrgContext, orderId: string, ticketId: string, holder: { firstName: string; lastName: string }) {
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, orderId, order: { organizationId: ctx.organization.id } } });
  if (!ticket) throw new CoreError("NOT_FOUND");
  await db.ticket.update({ where: { id: ticket.id }, data: { holderFirstName: holder.firstName.trim(), holderLastName: holder.lastName.trim() } });
  await audit({ action: "ticket.holder_updated", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Ticket", targetId: ticket.id });
}
