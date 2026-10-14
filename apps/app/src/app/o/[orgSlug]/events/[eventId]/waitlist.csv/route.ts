import { can } from "@evoly/core";
import { requireOrgContext } from "@/server/context";
import { waitlistCsv } from "@/server/waitlist";

export const dynamic = "force-dynamic";

/** Export de la liste d'attente (RG-ATT-06) : CSV pour Excel, réservé à qui peut voir les commandes. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "ORDERS_VIEW")) return new Response("Accès refusé", { status: 403 });
  return new Response(await waitlistCsv(ctx, eventId), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="liste-attente.csv"', "Cache-Control": "no-store" },
  });
}
