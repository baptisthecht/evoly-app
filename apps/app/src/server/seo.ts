import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canonicalEventUrl, canonicalOrgUrl } from "./canonical";
import type { SiteResolution } from "./publicEvents";

/**
 * Référencement des billetteries : robots.txt (robots d'IA explicitement autorisés pour la visibilité dans les
 * réponses de ChatGPT, Perplexity, Claude, Gemini…), sitemap.xml et adresse des images d'aperçu générées.
 */
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "Google-Extended", "Applebot-Extended", "Bingbot", "CCBot"];
const PRIVATE_PATHS = ["/billets/", "/api/"];

export function siteRobots(sitemapUrl: string): string {
  const rules = ["Allow: /", ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`)].join("\n");
  return [`User-agent: *\n${rules}`, `${AI_BOTS.map((b) => `User-agent: ${b}`).join("\n")}\n${rules}`, `Sitemap: ${sitemapUrl}`].join("\n\n") + "\n";
}

/** Tableau de bord et espaces privés : jamais indexés. */
export const appRobots = () => "User-agent: *\nDisallow: /\n";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Pages publiques d'une billetterie : accueil (organisation) et événements publics, avec leur dernière modification. */
export async function siteSitemap(site: SiteResolution): Promise<string> {
  if (site.kind !== "ORG" && site.kind !== "EVENT") return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n';
  const org = site.org;
  const events = await db.event.findMany({
    where: { organizationId: org.id, visibility: "PUBLIC", status: { in: ["PUBLISHED", "SALES_PAUSED", "ENDED"] }, ...(site.kind === "EVENT" ? { id: site.eventId } : {}) },
    select: { id: true, slug: true, subdomain: true, updatedAt: true, startsAt: true },
    orderBy: { startsAt: "desc" },
    take: 5000,
  });
  const urls: Array<{ loc: string; lastmod: Date; priority: string }> = [];
  if (site.kind === "ORG") urls.push({ loc: await canonicalOrgUrl(org), lastmod: events.reduce((d, e) => (e.updatedAt > d ? e.updatedAt : d), new Date(0)), priority: "0.8" });
  const now = Date.now();
  for (const e of events) urls.push({ loc: await canonicalEventUrl(org, e), lastmod: e.updatedAt, priority: e.startsAt.getTime() > now ? "1.0" : "0.4" });
  const body = urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod.getTime() > 0 ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ""}<priority>${u.priority}</priority></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** Image d'aperçu générée (1 200 × 630), versionnée par la date de modification pour rafraîchir les caches des réseaux. */
export const eventOgImageUrl = (eventId: string, updatedAt: Date) => `${env().NEXT_PUBLIC_APP_URL}/api/og/event/${eventId}?v=${updatedAt.getTime().toString(36)}`;
export const orgOgImageUrl = (orgId: string) => `${env().NEXT_PUBLIC_APP_URL}/api/og/org/${orgId}`;
