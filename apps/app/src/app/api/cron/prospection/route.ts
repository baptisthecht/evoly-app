import { env } from "@/lib/env";
import { sendDueProspectEmails } from "@/server/prospection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prospection : envoie l'e-mail programmé dû, au plus un par minute. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("Non autorisé", { status: 401 });
  return Response.json(await sendDueProspectEmails());
}
