import { can } from "@evoly/core";
import { requireOrgContext } from "@/server/context";
import { cashReportCsv } from "@/server/boxOffice";

export const dynamic = "force-dynamic";

/** Export du rapport de caisse (RG-POS-07) : CSV pour Excel, réservé à qui peut voir les commandes. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "ORDERS_VIEW")) return new Response("Accès refusé", { status: 403 });
  return new Response(await cashReportCsv(ctx, eventId), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="rapport-de-caisse.csv"', "Cache-Control": "no-store" },
  });
}
