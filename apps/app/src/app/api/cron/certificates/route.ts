import { env } from "@/lib/env";
import { checkCertificates } from "@/server/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-CDM-02 : vérification des certificats des domaines personnalisés (une fois par jour, Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  return Response.json(await checkCertificates());
}
