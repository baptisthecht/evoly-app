import "server-only";
import { CoreError } from "@evoly/core";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "./checkout";
import type { OrgContext } from "./context";
import { findEvent } from "./events";
import { afterOrderPaid } from "./orders";
import { organizationPublicUrl } from "./urls";
import { csvSafe } from "@/lib/csv";

/**
 * Vente sur place (section 9.27) depuis l'application du scanner : même stock que la vente en ligne (RG-POS-01), billets marqués
 * entrés au moment de la vente (RG-POS-04), e-mail du client facultatif (RG-POS-05), rapport de caisse par vendeur (RG-POS-07).
 */
export type SellingLink = { id: string; eventId: string; label: string; canSell: boolean; checkOnly: boolean };
export type SaleInput = {
  lines: Array<{ ticketTypeId: string; quantity: number }>;
  options?: Array<{ optionId: string; quantity: number }>; // options vendables sans billet (RG-OPT-03)
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
  const r = await reserveOrder({ eventId: link.eventId, lines: input.lines, options: input.options ?? [], locale: "fr" }, now);
  await db.$transaction([
    db.order.update({
      where: { id: r.orderId },
      data: {
        source: "BOX_OFFICE",
        boxOfficeMode: "CASH",
        soldByLinkId: link.id,
        soldByDeviceId: input.deviceId ?? null,
        applicationFeeMinor: 0,
        buyerEmail: email ?? "", // e-mail et nom facultatifs sur place (RG-POS-05) : vides s'ils ne sont pas donnés, aucun envoi
        buyerFirstName: input.firstName?.trim() || "",
        buyerLastName: input.lastName?.trim() || "",
      },
    }),
    db.orderItem.updateMany({ where: { orderId: r.orderId }, data: { unitFeeMinor: 0 } }),
    db.orderOption.updateMany({ where: { orderId: r.orderId }, data: { unitFeeMinor: 0 } }), // en espèces, sans commission, options comprises
  ]);
  if ((await finalizeOrder(r.orderId)) !== "PAID") throw new CoreError("BOX_OFFICE_FAILED");
  const tickets = await markEntered(r.orderId, link, input.deviceId, now);
  if (email) await afterOrderPaid(r.orderId); // billets et reçu envoyés au client
  // options achetées sans billet : le code de retrait à donner au client (RG-OPT-03)
  const { optionsShortCode } = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, select: { optionsShortCode: true } });
  return { orderId: r.orderId, reference: r.reference, totalMinor: r.totalMinor, tickets, optionsShortCode };
}

/**
 * Paiement par QR code (section 9.27, premier mode) : places réservées comme en ligne, commission habituelle (RG-POS-03) ; le client
 * scanne le code et paie sur son téléphone, sur la page de paiement du site de l'organisateur.
 */
export async function startQrSale(link: SellingLink, input: SaleInput, now = new Date()) {
  if (!link.canSell || link.checkOnly) throw new CoreError("BOX_OFFICE_FORBIDDEN");
  const r = await reserveOrder({ eventId: link.eventId, lines: input.lines, options: input.options ?? [], locale: "fr" }, now);
  await db.order.update({
    where: { id: r.orderId },
    data: { source: "BOX_OFFICE", boxOfficeMode: "QR", soldByLinkId: link.id, soldByDeviceId: input.deviceId ?? null },
  });
  const org = await db.event.findUniqueOrThrow({ where: { id: link.eventId }, select: { organization: { select: { slug: true, subdomain: true } } } });
  const url = `${organizationPublicUrl(org.organization.subdomain ?? org.organization.slug)}/payer/${r.token}`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { orderId: r.orderId, url, qrSvg, totalMinor: r.totalMinor, expiresAt: r.expiresAt.toISOString() };
}

/** Suivi d'un paiement par QR code, seulement par le lien qui l'a lancé ; une fois payé, billets marqués entrés (RG-POS-04). */
export async function qrSaleStatus(link: SellingLink, orderId: string, deviceId?: string | null, now = new Date()) {
  const order = await db.order.findFirst({ where: { id: orderId, soldByLinkId: link.id, boxOfficeMode: "QR" }, select: { status: true } });
  if (!order) throw new CoreError("NOT_FOUND");
  if (order.status === "PAID")
    return { status: "PAID" as const, tickets: (await markEntered(orderId, link, deviceId, now)) || (await db.ticket.count({ where: { orderId } })) };
  return { status: order.status };
}

/** Rapport de caisse : ventes sur place par vendeur et par mode de paiement, remboursements déduits (RG-POS-07). */
/** Appareil lisible : les 4 derniers caractères de son identifiant (« 7F3A »). */
export function shortDevice(id: string | null | undefined): string | null {
  if (!id) return null;
  return (
    id
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-4)
      .toUpperCase() || "?"
  );
}

export type CashRow = { label: string; device: string | null; mode: "CASH" | "QR"; sales: number; amountMinor: number };

/**
 * Rapport de caisse (RG-POS-07) : par caisse, par appareil et par mode, montants nets des remboursements ;
 * les ventes entièrement remboursées n'y figurent plus.
 */
export async function cashReport(ctx: OrgContext, eventId: string): Promise<CashRow[]> {
  await findEvent(ctx, eventId);
  const rows = await db.order.groupBy({
    by: ["soldByLinkId", "soldByDeviceId", "boxOfficeMode"],
    where: { eventId, source: "BOX_OFFICE", status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    _count: { _all: true },
    _sum: { totalMinor: true, refundedMinor: true },
  });
  const links = await db.scannerLink.findMany({
    where: { id: { in: rows.map((r) => r.soldByLinkId).filter((x): x is string => !!x) } },
    select: { id: true, label: true },
  });
  return rows
    .map((r) => ({
      label: links.find((l) => l.id === r.soldByLinkId)?.label ?? "",
      device: shortDevice(r.soldByDeviceId),
      mode: (r.boxOfficeMode ?? "CASH") as "CASH" | "QR",
      sales: r._count._all,
      amountMinor: (r._sum.totalMinor ?? 0) - (r._sum.refundedMinor ?? 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr") || (a.device ?? "~").localeCompare(b.device ?? "~") || a.mode.localeCompare(b.mode));
}

/** Espèces à remettre par caisse et par appareil (RG-POS-07) : ventes en espèces, nettes des remboursements ; le QR code passe par Stripe. */
export function cashHandOver(rows: CashRow[]) {
  const out: { label: string; device: string | null; amountMinor: number }[] = [];
  for (const r of rows) {
    if (r.mode !== "CASH") continue;
    const same = out.find((o) => o.label === r.label && o.device === r.device);
    if (same) same.amountMinor += r.amountMinor;
    else out.push({ label: r.label, device: r.device, amountMinor: r.amountMinor });
  }
  return out;
}

/** CSV pour Excel (BOM, point-virgule) : chaque cellule entre guillemets. */
const csv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map((v) => `"${csvSafe(v).replace(/"/g, '""')}"`).join(";")).join("\r\n") + "\r\n";
const dateCell = (d: Date | null | undefined, timeZone: string) =>
  d ? new Intl.DateTimeFormat("fr-BE", { timeZone, dateStyle: "short", timeStyle: "short" }).format(d) : "";

/**
 * Export du rapport de caisse (RG-POS-07) : une ligne par vente sur place (date, caisse, mode, référence, billets, montants), puis le total.
 * Document comptable : aucune donnée de l'acheteur.
 */
export async function cashReportCsv(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  const ev = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { timezone: true, organization: { select: { timezone: true } } } });
  const tz = ev.timezone ?? ev.organization.timezone;
  const orders = await db.order.findMany({
    where: { eventId, source: "BOX_OFFICE", status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
    select: {
      reference: true,
      paidAt: true,
      createdAt: true,
      boxOfficeMode: true,
      soldByLinkId: true,
      soldByDeviceId: true,
      totalMinor: true,
      refundedMinor: true,
      currency: true,
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const links = await db.scannerLink.findMany({
    where: { id: { in: orders.map((o) => o.soldByLinkId).filter((x): x is string => !!x) } },
    select: { id: true, label: true },
  });
  const euros = (minor: number) => (minor / 100).toFixed(2);
  const rows: unknown[][] = [["Date", "Caisse", "Appareil", "Mode", "Référence", "Billets", "Montant", "Remboursé", "Net", "Devise"]];
  let total = 0,
    rembourse = 0,
    billets = 0;
  for (const o of orders) {
    total += o.totalMinor;
    rembourse += o.refundedMinor;
    billets += o._count.tickets;
    rows.push([
      dateCell(o.paidAt ?? o.createdAt, tz),
      links.find((l) => l.id === o.soldByLinkId)?.label ?? "",
      shortDevice(o.soldByDeviceId) ?? "",
      o.boxOfficeMode === "QR" ? "QR code" : "Espèces",
      o.reference,
      o._count.tickets,
      euros(o.totalMinor),
      euros(o.refundedMinor),
      euros(o.totalMinor - o.refundedMinor),
      o.currency,
    ]);
  }
  rows.push(["Total", "", "", "", `${orders.length} vente(s)`, billets, euros(total), euros(rembourse), euros(total - rembourse), orders[0]?.currency ?? ""]);
  return csv(rows);
}
