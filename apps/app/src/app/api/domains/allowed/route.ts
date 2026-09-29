import { isHostAllowed } from "@/server/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-DOM-03 : interrogé par le proxy d'entrée (Caddy « on_demand_tls ask ») avant d'émettre un certificat. */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain") ?? "";
  return (await isHostAllowed(domain)) ? new Response("ok") : new Response("inconnu", { status: 404 });
}
