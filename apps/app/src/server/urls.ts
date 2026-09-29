import "server-only";
import { env } from "@/lib/env";

function protocol(): string {
  return new URL(env().NEXT_PUBLIC_APP_URL).protocol.replace(":", "");
}

/** Page de l'organisation : mon-asso.evoly.me (RG-PUB-07). */
export function organizationPublicUrl(subdomain: string): string {
  return `${protocol()}://${subdomain}.${env().NEXT_PUBLIC_BASE_DOMAIN}`;
}

/**
 * URL canonique d'un événement (RG-DOM-06) : sous-domaine d'événement (Pro), sinon page de l'organisation.
 * Les domaines personnalisés s'ajouteront en tête de cette règle.
 */
export function eventPublicUrl(org: { subdomain: string | null; slug: string }, event: { slug: string; subdomain?: string | null }): string {
  if (event.subdomain) return `${protocol()}://${event.subdomain}.${env().NEXT_PUBLIC_BASE_DOMAIN}`;
  return `${organizationPublicUrl(org.subdomain ?? org.slug)}/${event.slug}`;
}

/** Lien court à partager : evoly.me/e/7KQ2XM (RG-EVT-09). */
export function eventShortUrl(publicCode: string): string {
  return `${env().NEXT_PUBLIC_SHORT_LINK_BASE ?? env().NEXT_PUBLIC_APP_URL}/e/${publicCode}`;
}
