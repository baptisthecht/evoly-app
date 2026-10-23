import { can, hasFeature } from "@evoly/core";
import { ambassadorsCsv } from "@/server/ambassadors";
import { requireOrgContext } from "@/server/context";

export const dynamic = "force-dynamic";

/** Export du classement des ambassadeurs (CSV, Excel). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string; eventId: string }> },
) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (
    !hasFeature(ctx.features, "AMBASSADORS") ||
    !(can(ctx.membership, "PROMO_MANAGE") || can(ctx.membership, "STATS_VIEW"))
  )
    return new Response("Accès refusé", { status: 403 });
  return new Response(await ambassadorsCsv(ctx, eventId), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ambassadeurs.csv"',
      "Cache-Control": "no-store",
    },
  });
}
