import { can } from "@evoly/core";
import { orgContextFromSession } from "@/server/context";
import { ticketsCsv } from "@/server/finances";

export const dynamic = "force-dynamic";

/** US-STAT-03 : export des participants d'un événement (un billet par ligne, titulaires, entrées). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return new Response("Introuvable", { status: 404 });
  if (!can(ctx.membership, "ORDERS_VIEW")) return new Response("Accès refusé", { status: 403 });
  return new Response(await ticketsCsv(ctx, { period: "ALL", eventId, withAnswers: true }), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="participants-${eventId}.csv"`, "cache-control": "private, no-store" } });
}
