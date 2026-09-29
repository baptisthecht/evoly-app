import { db } from "@/lib/db";
import { findOrderIdByToken } from "@/server/checkout";
import { ticketsPdfFor } from "@/server/orders";
import { assertSiteRequest } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

/** PDF des billets : une page par billet (section 9.12). */
export async function GET(_req: Request, { params }: { params: Promise<{ sub: string; token: string }> }) {
  const { sub, token } = await params;
  await assertSiteRequest(sub);
  const orderId = await findOrderIdByToken(token);
  const order = orderId
    ? await db.order.findUnique({ where: { id: orderId }, include: { organization: { select: { name: true } }, event: true, tickets: { include: { ticketType: { select: { name: true } }, seat: { select: { label: true, row: { select: { name: true } } } } }, orderBy: [{ ticketTypeId: "asc" }, { createdAt: "asc" }] } } })
    : null;
  // une commande en partie remboursée (place revendue, par exemple) garde ses autres billets
  if (!order || (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED")) return new Response("Introuvable", { status: 404 });
  const bytes = await ticketsPdfFor(order, order.buyerLocale === "en" ? "en" : "fr");
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="billets-${order.reference}.pdf"`, "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
