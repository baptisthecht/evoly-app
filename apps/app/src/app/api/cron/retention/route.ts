import { env } from "@/lib/env";
import { applyRetention } from "@/server/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chaque nuit (section 11, RG-RGPD-02) : anonymisation au-delà des durées de conservation. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json(await applyRetention());
}
