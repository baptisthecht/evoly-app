import "server-only";
import { hasFeature, type PlanFeature } from "@evoly/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { organizationPublicUrl } from "./urls";

const protocol = () => new URL(env().NEXT_PUBLIC_APP_URL).protocol.replace(":", "");
const port = () => {
  const p = env().NEXT_PUBLIC_BASE_DOMAIN.split(":")[1];
  return p ? `:${p}` : "";
};

/**
 * RG-DOM-06 : adresse canonique d'un événement, dans l'ordre du cahier des charges : domaine personnalisé
 * (celui de l'événement, sinon celui de l'organisation), puis sous-domaine de l'événement, puis sous-domaine de l'organisation.
 */
export async function canonicalEventUrl(
  org: { id: string; subdomain: string | null; slug: string; features: readonly PlanFeature[] },
  event: { id: string; slug: string; subdomain?: string | null },
): Promise<string> {
  if (hasFeature(org.features, "CUSTOM_DOMAINS")) {
    const domains = await db.customDomain.findMany({
      where: { organizationId: org.id, status: "ACTIVE", OR: [{ scope: "EVENT", eventId: event.id }, { scope: "ORGANIZATION" }] },
      select: { domain: true, scope: true },
      orderBy: { createdAt: "asc" },
    });
    const own = domains.find((d) => d.scope === "EVENT");
    if (own) return `${protocol()}://${own.domain}${port()}`;
    const shared = domains.find((d) => d.scope === "ORGANIZATION");
    if (shared) return `${protocol()}://${shared.domain}${port()}/${event.slug}`;
  }
  if (event.subdomain && hasFeature(org.features, "EVENT_SUBDOMAINS")) return `${protocol()}://${event.subdomain}.${env().NEXT_PUBLIC_BASE_DOMAIN}`;
  return `${organizationPublicUrl(org.subdomain ?? org.slug)}/${event.slug}`;
}

/** Adresse canonique de la page de l'organisation : son domaine personnalisé actif, sinon son sous-domaine. */
export async function canonicalOrgUrl(org: { id: string; subdomain: string | null; slug: string; features: readonly PlanFeature[] }): Promise<string> {
  if (hasFeature(org.features, "CUSTOM_DOMAINS")) {
    const d = await db.customDomain.findFirst({
      where: { organizationId: org.id, status: "ACTIVE", scope: "ORGANIZATION" },
      select: { domain: true },
      orderBy: { createdAt: "asc" },
    });
    if (d) return `${protocol()}://${d.domain}${port()}`;
  }
  return organizationPublicUrl(org.subdomain ?? org.slug);
}
