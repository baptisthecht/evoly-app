import { env } from "@/lib/env";
import { retryFailedEmails } from "@/server/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-ARC-06 : renvoi des e-mails en échec (toutes les 5 minutes, Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json(await retryFailedEmails());
}
