import { can } from "@evoly/core";
import { orgContextFromSession } from "@/server/context";
import { ordersCsv, ticketsCsv, type Period } from "@/server/finances";

export const dynamic = "force-dynamic";
const PERIODS: Period[] = ["THIS_MONTH", "LAST_MONTH", "LAST_30_DAYS", "THIS_YEAR", "ALL"];

/** Exports CSV de la page Finances : détail par commande ou par billet. */
export async function GET(req: Request, { params }: { params: Promise<{ orgSlug: string; kind: string }> }) {
  const { orgSlug, kind } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return new Response("Introuvable", { status: 404 });
  if (!can(ctx.membership, "FINANCE_VIEW")) return new Response("Accès refusé", { status: 403 });
  if (kind !== "orders" && kind !== "tickets") return new Response("Introuvable", { status: 404 });
  const url = new URL(req.url);
  const period = (PERIODS as string[]).includes(url.searchParams.get("period") ?? "") ? (url.searchParams.get("period") as Period) : "THIS_MONTH";
  const eventId = url.searchParams.get("event") || undefined;
  const csv = kind === "orders" ? await ordersCsv(ctx, { period, eventId }) : await ticketsCsv(ctx, { period, eventId });
  const name = `${kind === "orders" ? "commandes" : "billets"}-${ctx.organization.slug}-${period.toLowerCase()}.csv`;
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
