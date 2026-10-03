import { resolveSite } from "@/server/publicEvents";
import { siteSitemap } from "@/server/seo";

export const dynamic = "force-dynamic"; // calculé à chaque demande (événements publiés à l'instant)

/** sitemap.xml d'une billetterie : accueil et événements publics. */
export async function GET(_req: Request, { params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  const site = await resolveSite(decodeURIComponent(sub));
  if (!site) return new Response("Not found\n", { status: 404 });
  return new Response(await siteSitemap(site), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}
