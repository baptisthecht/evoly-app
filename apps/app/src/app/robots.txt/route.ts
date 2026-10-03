import { appRobots } from "@/server/seo";

/** robots.txt de l'app (tableau de bord) : rien à indexer. Les billetteries ont le leur. */
export function GET() {
  return new Response(appRobots(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
