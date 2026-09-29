import "server-only";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { resolveSite } from "./publicEvents";

/** Les pages publiques ne sont servies que par la réécriture d'hôte du proxy (RG-DOM-01). */
export async function assertSiteRequest(sub: string): Promise<void> {
  if ((await headers()).get("x-evoly-site") !== sub) notFound();
}

/** Contrôle commun des pages publiques : hôte réécrit par le proxy, redirection 301 des anciennes adresses (RG-SDM-03). */
export async function siteGate(sub: string, path: string) {
  await assertSiteRequest(sub);
  const site = await resolveSite(sub);
  if (!site) notFound();
  if (site.kind === "REDIRECT") permanentRedirect(`${site.base}${path === "/" ? site.rootPath || "/" : path}`);
  return site;
}
