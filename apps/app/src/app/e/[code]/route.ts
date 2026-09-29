import { db } from "@/lib/db";
import { eventPublicUrl } from "@/server/urls";
import { canonicalEventUrl } from "@/server/canonical";
import { getPublicOrganization } from "@/server/publicEvents";

export const dynamic = "force-dynamic";

/** RG-EVT-09 : le lien court redirige vers l'adresse canonique de l'événement. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const event = await db.event.findFirst({
    where: { publicCode: code.toUpperCase(), deletedAt: null, status: { in: ["PUBLISHED", "SALES_PAUSED", "CANCELLED", "ENDED"] } },
    select: { id: true, slug: true, subdomain: true, organization: { select: { subdomain: true, slug: true } } },
  });
  if (!event) return new Response("Événement introuvable", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const org = event.organization.subdomain ? await getPublicOrganization(event.organization.subdomain) : null;
  return Response.redirect(org ? await canonicalEventUrl(org, { id: event.id, slug: event.slug, subdomain: event.subdomain }) : eventPublicUrl(event.organization, event), 302);
}
