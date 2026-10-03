import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { hasFeatureForOrg } from "@/server/og";

/** Image d'aperçu de la page d'accueil d'une billetterie : nom de l'organisation et ses prochains événements. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true, locale: true, brand: { select: { displayName: true, primaryColor: true, hideEvolyBranding: true } }, _count: { select: { events: { where: { visibility: "PUBLIC", status: "PUBLISHED", startsAt: { gte: new Date() } } } } } } });
  const en = org?.locale === "en";
  const { branded, hidePowered } = org ? await hasFeatureForOrg(orgId, org.brand?.hideEvolyBranding ?? true) : { branded: false, hidePowered: false };
  const name = org ? (branded ? (org.brand?.displayName ?? org.name) : org.name) : "Evoly";
  const n = org?._count.events ?? 0;
  const sub = en ? (n ? `${n} upcoming event${n > 1 ? "s" : ""} · tickets online` : "Official ticketing") : n ? `${n} événement${n > 1 ? "s" : ""} à venir · billets en ligne` : "Billetterie officielle";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: branded && org?.brand?.primaryColor ? org.brand.primaryColor : "#222222", color: "#FFF6F0", padding: "72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 28, color: "#FFB8E8" }}>{en ? "Tickets" : "Billetterie"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: name.length > 30 ? 64 : 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 34, opacity: 0.85 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.8 }}>{hidePowered ? "" : en ? "Tickets on evoly.me" : "Billetterie sur evoly.me"}</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
  );
}
