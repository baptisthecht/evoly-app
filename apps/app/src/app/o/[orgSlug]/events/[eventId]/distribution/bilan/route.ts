import { can, CoreError, hasFeature } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { orgContextFromSession } from "@/server/context";
import { channelReportCsv, eventChannelReport } from "@/server/distributors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bilan par canal en CSV : Evoly (en ligne, sur place, offerts) et chaque réseau (docs/COMPATIBILITE_RESEAUX.md). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!can(ctx.membership, "EVENTS_EDIT")) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!hasFeature(ctx.features, "DISTRIBUTION")) return Response.json({ error: "PRO_REQUIRED" }, { status: 403 });
  try {
    const t = await getTranslations("distribution");
    const csv = channelReportCsv(await eventChannelReport(ctx, eventId), {
      ONLINE: t("channel_ONLINE"),
      BOX_OFFICE: t("channel_BOX_OFFICE"),
      COMPLIMENTARY: t("channel_COMPLIMENTARY"),
      header: [t("colChannel"), t("colTickets"), t("colEntered"), t("colRevenue")],
      total: t("total"),
    });
    return new Response(`\ufeff${csv}`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="bilan-par-canal.csv"', "cache-control": "no-store" },
    });
  } catch (e) {
    if (e instanceof CoreError) return Response.json({ error: e.code }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    throw e;
  }
}
