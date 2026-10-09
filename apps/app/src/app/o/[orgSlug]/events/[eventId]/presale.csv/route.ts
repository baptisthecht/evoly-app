import { can } from "@evoly/core";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { presaleCsv } from "@/server/presale";
import { eventPublicUrl } from "@/server/urls";

export const dynamic = "force-dynamic";

/** Export CSV de tous les codes de prévente et de leur lien personnel (RG-PRV-01). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "EVENTS_PUBLISH")) return new Response("Accès refusé", { status: 403 });
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    select: { slug: true, subdomain: true },
  });
  if (!event) return new Response("Introuvable", { status: 404 });
  const csv = await presaleCsv(ctx, eventId, eventPublicUrl(ctx.organization, event));
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="codes-de-prevente.csv"', "Cache-Control": "no-store" },
  });
}
