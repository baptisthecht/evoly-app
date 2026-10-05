import { db } from "@/lib/db";
import { resaleEventUrl } from "@/server/resale";

export const dynamic = "force-dynamic";

/** Lien court d'une annonce de revente : evoly.me/r/[code] (section 9.13). */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const listing = await db.resaleListing.findUnique({
    where: { linkCode: code.slice(0, 40) },
    select: { linkCode: true, event: { select: { organization: { select: { subdomain: true, slug: true } } } } },
  });
  if (!listing) return new Response("Annonce introuvable", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return Response.redirect(resaleEventUrl(listing.event.organization, listing.linkCode), 302);
}
