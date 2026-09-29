import { effectiveEnd } from "@evoly/core";
import { db } from "@/lib/db";
import { findOrderIdByToken } from "@/server/checkout";
import { assertSiteRequest } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** Ajout au calendrier (fichier ICS, section 9.12). */
export async function GET(_req: Request, { params }: { params: Promise<{ sub: string; token: string }> }) {
  const { sub, token } = await params;
  await assertSiteRequest(sub);
  const orderId = await findOrderIdByToken(token);
  const order = orderId ? await db.order.findUnique({ where: { id: orderId }, include: { event: true } }) : null;
  if (!order || order.status !== "PAID") return new Response("Introuvable", { status: 404 });
  const e = order.event;
  const location = e.locationType === "ONLINE" ? (e.onlineUrl ?? "") : [e.locationName, e.addressLine1, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Evoly//Billetterie//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}-${order.id}@evoly.me`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(effectiveEnd(e.startsAt, e.endsAt))}`,
    `SUMMARY:${escape(e.title)}`,
    location ? `LOCATION:${escape(location)}` : "",
    e.summary ? `DESCRIPTION:${escape(e.summary)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${e.slug}.ics"`, "cache-control": "private, no-store" } });
}
