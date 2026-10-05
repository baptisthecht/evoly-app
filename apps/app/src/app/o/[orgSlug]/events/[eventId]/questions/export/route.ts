import { can } from "@evoly/core";
import { orgContextFromSession } from "@/server/context";
import { answersCsv } from "@/server/questions";

export const dynamic = "force-dynamic";

/** Export des réponses aux questions à l'achat. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return new Response("Introuvable", { status: 404 });
  if (!can(ctx.membership, "ORDERS_VIEW")) return new Response("Accès refusé", { status: 403 });
  return new Response(await answersCsv(ctx, eventId), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="reponses-${eventId}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
