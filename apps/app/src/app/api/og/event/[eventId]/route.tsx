import { formatDateTime, formatMoney, toLocale } from "@evoly/i18n";
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { hasFeatureForOrg } from "@/server/og";

const COPY = {
  fr: { from: "Dès", free: "Entrée gratuite", powered: "Billetterie sur evoly.me", tickets: "Billets" },
  en: { from: "From", free: "Free entry", powered: "Tickets on evoly.me", tickets: "Tickets" },
  es: { from: "Desde", free: "Entrada gratuita", powered: "Entradas en evoly.me", tickets: "Entradas" },
  de: { from: "Ab", free: "Eintritt frei", powered: "Tickets auf evoly.me", tickets: "Tickets" },
  it: { from: "Da", free: "Ingresso gratuito", powered: "Biglietti su evoly.me", tickets: "Biglietti" },
  pt: { from: "Desde", free: "Entrada gratuita", powered: "Bilhetes em evoly.me", tickets: "Bilhetes" },
  nl: { from: "Vanaf", free: "Gratis toegang", powered: "Tickets op evoly.me", tickets: "Tickets" },
} as const;

/**
 * Image d'aperçu d'un événement (Open Graph, Twitter/X, WhatsApp, LinkedIn…) : titre, date, lieu, prix et organisateur,
 * aux couleurs de sa marque en Pro ; « Billetterie sur evoly.me » en offre gratuite. Événement privé : image générique.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const e = await db.event.findUnique({
    where: { id: eventId },
    select: { title: true, startsAt: true, timezone: true, city: true, locationName: true, currency: true, visibility: true, status: true, organizationId: true, organization: { select: { name: true, locale: true, brand: { select: { displayName: true, primaryColor: true, hideEvolyBranding: true } } } }, ticketTypes: { select: { priceMinor: true } } },
  });
  const visible = e && e.visibility !== "PRIVATE" && e.status !== "DRAFT" && e.status !== "ARCHIVED";
  const locale = toLocale(e?.organization.locale);
  const c = COPY[locale];
  const { branded, hidePowered } = visible ? await hasFeatureForOrg(e.organizationId, e.organization.brand?.hideEvolyBranding ?? true) : { branded: false, hidePowered: false };
  const bg = branded && e?.organization.brand?.primaryColor ? e.organization.brand.primaryColor : "#222222";
  const accent = "#FFB8E8";
  const min = visible && e.ticketTypes.length ? Math.min(...e.ticketTypes.map((t) => t.priceMinor)) : null;
  const price = min === null ? null : min === 0 ? c.free : `${c.from} ${formatMoney(min, e!.currency, locale, { trimZeroCents: true })}`;
  const orgName = e ? (branded ? (e.organization.brand?.displayName ?? e.organization.name) : e.organization.name) : "Evoly";
  const title = visible ? e.title : c.tickets;
  const when = visible ? formatDateTime(e.startsAt, e.timezone, locale, "long") : null;
  const where = visible ? [e.locationName, e.city].filter(Boolean).join(", ") : null;
  const size = title.length > 60 ? 54 : title.length > 34 ? 66 : 82;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: bg, color: "#FFF6F0", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.85 }}>{orgName}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: size, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
          {when ? <div style={{ display: "flex", fontSize: 34, color: accent }}>{when}</div> : null}
          {where ? <div style={{ display: "flex", fontSize: 30, opacity: 0.85 }}>{where}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {price ? <div style={{ display: "flex", fontSize: 32, fontWeight: 700, background: accent, color: "#222222", padding: "12px 28px", borderRadius: 999 }}>{price}</div> : <div style={{ display: "flex" }} />}
          {hidePowered ? null : <div style={{ display: "flex", fontSize: 26, opacity: 0.8 }}>{c.powered}</div>}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
