import { env } from "@/lib/env";
import { issuePreviousMonthStatements } from "@/server/finances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-FEE-30 : relevés du mois précédent, à lancer le 1er de chaque mois (Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json({ issued: await issuePreviousMonthStatements() });
}
