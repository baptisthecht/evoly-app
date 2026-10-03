import { headers } from "next/headers";
import { resolveSite } from "@/server/publicEvents";
import { siteRobots } from "@/server/seo";

export const dynamic = "force-dynamic"; // calculé à chaque demande (événements publiés à l'instant)

/** robots.txt d'une billetterie (sous-domaine, domaine personnalisé, sous-domaine d'événement). */
export async function GET(_req: Request, { params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  const site = await resolveSite(decodeURIComponent(sub));
  if (!site) return new Response("Not found\n", { status: 404 });
  const host = (await headers()).get("host") ?? "";
  const proto = host.startsWith("localhost") || /:\d+$/.test(host) ? "http" : "https";
  return new Response(siteRobots(`${proto}://${host}/sitemap.xml`), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
