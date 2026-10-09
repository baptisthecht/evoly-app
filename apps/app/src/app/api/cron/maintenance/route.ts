import { env } from "@/lib/env";
import { aggregateDailyStats, purgeExpiredTokens } from "@/server/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toutes les heures (section 11) : jetons, invitations et redirections expirés ; agrégats quotidiens des événements. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json({ purged: await purgeExpiredTokens(), dailyStats: await aggregateDailyStats() });
}
