import { env } from "@/lib/env";
import { runDueMarketingAutomations, runDueReminders } from "@/server/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** US-MKT-01 : rappels J-7, J-1 et jour J, à lancer toutes les 15 minutes (Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json({ reminders: await runDueReminders(), marketing: await runDueMarketingAutomations() });
}
