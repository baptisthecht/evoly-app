import { offerForVisitor } from "@/server/promotions";

export const dynamic = "force-dynamic";

/** Information publique, lue par le site vitrine (autre origine) : aucune donnée personnelle. */
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "public, max-age=300",
  "content-type": "application/json; charset=utf-8",
};

/** Offre en cours pour un visiteur (docs/OFFRES.md) : celle de sa campagne (?offre=CODE), sinon l'offre publique. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lang = (url.searchParams.get("lang") ?? "fr").slice(0, 5);
  const offer = await offerForVisitor(url.searchParams.get("offre"), lang);
  return new Response(JSON.stringify({ offer }), { headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
