import { env } from "@/lib/env";
import { monthlyVenuePayouts } from "@/server/venues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Le 1er de chaque mois (RG-LIEU-06) : versement de leur part aux lieux partenaires, selon leur seuil. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("Non autorisé", { status: 401 });
  return Response.json(await monthlyVenuePayouts());
}
