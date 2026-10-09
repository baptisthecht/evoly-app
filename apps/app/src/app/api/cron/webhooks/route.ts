import { env } from "@/lib/env";
import { retryFailedWebhooks } from "@/server/webhookRetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Relance des webhooks Stripe en échec, toutes les 5 minutes (section 11). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json(await retryFailedWebhooks());
}
