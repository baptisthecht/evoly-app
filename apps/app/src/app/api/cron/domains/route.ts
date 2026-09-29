import { env } from "@/lib/env";
import { verifyPendingDomains } from "@/server/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 9.19, étape 3 : vérification automatique des domaines en attente, toutes les 10 minutes pendant 48 heures. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json({ checked: await verifyPendingDomains() });
}
