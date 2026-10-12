import "server-only";
import { CoreError } from "@evoly/core";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "./checkout";
import type { OrgContext } from "./context";
import { findEvent } from "./events";
import { afterOrderPaid } from "./orders";

/**
 * Vente sur place (section 9.27) depuis l'application du scanner : même stock que la vente en ligne (RG-POS-01), billets marqués
 * entrés au moment de la vente (RG-POS-04), e-mail du client facultatif (RG-POS-05), rapport de caisse par vendeur (RG-POS-07).
 */
export type SellingLink = { id: string; eventId: string; label: string; canSell: boolean; checkOnly: boolean };
export type SaleInput = {
  lines: Array<{ ticketTypeId: string; quantity: number }>;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  deviceId?: string | null;
};

/** Billets d'une vente sur place marqués entrés, avec leur passage attribué au lien qui a vendu. */
async function markEntered(orderId: string, link: SellingLink, deviceId: string | null | undefined, now: Date) {
  const tickets = await db.ticket.findMany({ where: { orderId, status: "VALID" }, select: { id: true } });
  await db.$transaction([
    db.ticket.updateMany({ where: { orderId, status: "VALID" }, data: { status: "CHECKED_IN", checkedInAt: now } }),
    db.checkIn.createMany({
      data: tickets.map((t) => ({
        eventId: link.eventId,
        ticketId: t.id,
        scannerLinkId: link.id,
        result: "VALID" as const,
        method: "LIST" as const,
        deviceId: deviceId ?? null,
        scannedAt: now,
      })),
    }),
  ]);
  return tickets.length;
}

/** Vente en espèces : aucune commission Evoly (RG-POS-03), commande payée tout de suite, billets entrés. */
export async function sellCash(link: SellingLink, input: SaleInput, now = new Date()) {
  if (!link.canSell || link.checkOnly) throw new CoreError("BOX_OFFICE_FORBIDDEN");
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CoreError("INVALID_EMAIL");
  const r = await reserveOrder({ eventId: link.eventId, lines: input.lines, locale: "fr" }, now);
  await db.$transaction([
    db.order.update({
      where: { id: r.orderId },
      data: {
        source: "BOX_OFFICE",
        boxOfficeMode: "CASH",
        soldByLinkId: link.id,
        applicationFeeMinor: 0,
        buyerEmail: email ?? "", // e-mail et nom facultatifs sur place (RG-POS-05) : vides s'ils ne sont pas donnés, aucun envoi
        buyerFirstName: input.firstName?.trim() || "",
        buyerLastName: input.lastName?.trim() || "",
      },
    }),
    db.orderItem.updateMany({ where: { orderId: r.orderId }, data: { unitFeeMinor: 0 } }),
  ]);
  if ((await finalizeOrder(r.orderId)) !== "PAID") throw new CoreError("BOX_OFFICE_FAILED");
  const tickets = await markEntered(r.orderId, link, input.deviceId, now);
  if (email) await afterOrderPaid(r.orderId); // billets et reçu envoyés au client
  return { orderId: r.orderId, reference: r.reference, totalMinor: r.totalMinor, tickets };
}

/** Rapport de caisse : ventes sur place par vendeur et par mode de paiement, remboursements déduits (RG-POS-07). */
export async function cashReport(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  const rows = await db.order.groupBy({
    by: ["soldByLinkId", "boxOfficeMode"],
    where: { eventId, source: "BOX_OFFICE", status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    _count: { _all: true },
    _sum: { totalMinor: true, refundedMinor: true },
  });
  const links = await db.scannerLink.findMany({
    where: { id: { in: rows.map((r) => r.soldByLinkId).filter((x): x is string => !!x) } },
    select: { id: true, label: true },
  });
  return rows.map((r) => ({
    label: links.find((l) => l.id === r.soldByLinkId)?.label ?? "",
    mode: r.boxOfficeMode ?? "CASH",
    sales: r._count._all,
    amountMinor: (r._sum.totalMinor ?? 0) - (r._sum.refundedMinor ?? 0),
  }));
}
