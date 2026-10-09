import { env } from "@/lib/env";
import { sendSalesOpenAlerts } from "@/server/alerts";
import { notifyPublishedEvents } from "@/server/publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Publication programmée : prévient l'organisation dès qu'un événement devient public, et les inscrits « Prévenez-moi » dès l'ouverture des ventes, chaque minute. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json({ notified: await notifyPublishedEvents(), alerts: await sendSalesOpenAlerts() });
}
