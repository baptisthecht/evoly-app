import { env } from "@/lib/env";
import { processCampaigns } from "@/server/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 9.18 : campagnes dues, envoyées par lots (toutes les 5 minutes, Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json({ sent: await processCampaigns() });
}
