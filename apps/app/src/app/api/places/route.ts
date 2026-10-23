import { searchPlaces } from "@/server/places";
import { hit } from "@/server/rateLimit";
import { clientIp } from "@/server/requestInfo";

export const dynamic = "force-dynamic";

/** Suggestions d'adresses et de lieux pendant la saisie (création rapide, formulaires d'événement). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if ((await hit(`places:ip:${await clientIp()}`, 60)) > 60)
    return Response.json({ places: [] }, { status: 429 });
  const places = await searchPlaces(
    url.searchParams.get("q") ?? "",
    url.searchParams.get("lang") ?? "fr",
  );
  return Response.json(
    { places },
    { headers: { "cache-control": "private, max-age=300" } },
  );
}
