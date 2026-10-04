import { pick } from "@evoly/i18n";
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { hasFeatureForOrg } from "@/server/og";

/** Image d'aperçu de la page d'accueil d'une billetterie : nom de l'organisation et ses prochains événements. */
const ORG_OG = {
  fr: { sub: (n: number) => (n ? `${n} événement${n > 1 ? "s" : ""} à venir · billets en ligne` : "Billetterie officielle"), head: "Billetterie", powered: "Billetterie sur evoly.me" },
  en: { sub: (n: number) => (n ? `${n} upcoming event${n > 1 ? "s" : ""} · tickets online` : "Official ticketing"), head: "Tickets", powered: "Tickets on evoly.me" },
  es: { sub: (n: number) => (n ? `${n} ${n > 1 ? "eventos próximos" : "evento próximo"} · entradas online` : "Venta oficial de entradas"), head: "Entradas", powered: "Entradas en evoly.me" },
  de: { sub: (n: number) => (n ? `${n} ${n > 1 ? "kommende Veranstaltungen" : "kommende Veranstaltung"} · Tickets online` : "Offizielles Ticketing"), head: "Tickets", powered: "Tickets auf evoly.me" },
  it: { sub: (n: number) => (n ? `${n} ${n > 1 ? "eventi in arrivo" : "evento in arrivo"} · biglietti online` : "Biglietteria ufficiale"), head: "Biglietteria", powered: "Biglietti su evoly.me" },
  pt: { sub: (n: number) => (n ? `${n} ${n > 1 ? "eventos futuros" : "evento futuro"} · bilhetes online` : "Bilheteira oficial"), head: "Bilheteira", powered: "Bilhetes em evoly.me" },
  nl: { sub: (n: number) => (n ? `${n} ${n > 1 ? "komende evenementen" : "komend evenement"} · tickets online` : "Officiële ticketverkoop"), head: "Tickets", powered: "Tickets op evoly.me" },
};

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true, locale: true, brand: { select: { displayName: true, primaryColor: true, hideEvolyBranding: true } }, _count: { select: { events: { where: { visibility: "PUBLIC", status: "PUBLISHED", startsAt: { gte: new Date() } } } } } } });
  const c = pick(ORG_OG, org?.locale);
  const { branded, hidePowered } = org ? await hasFeatureForOrg(orgId, org.brand?.hideEvolyBranding ?? true) : { branded: false, hidePowered: false };
  const name = org ? (branded ? (org.brand?.displayName ?? org.name) : org.name) : "Evoly";
  const n = org?._count.events ?? 0;
  const sub = c.sub(n);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: branded && org?.brand?.primaryColor ? org.brand.primaryColor : "#222222", color: "#FFF6F0", padding: "72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 28, color: "#FFB8E8" }}>{c.head}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: name.length > 30 ? 64 : 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 34, opacity: 0.85 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.8 }}>{hidePowered ? "" : c.powered}</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
  );
}
