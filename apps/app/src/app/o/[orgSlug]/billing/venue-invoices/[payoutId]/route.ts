import { can } from "@evoly/core";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { selfBillingPdf } from "@/server/venues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-LIEU-07 : facture d'autofacturation d'un versement, pour le lieu concerné seulement. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string; payoutId: string }> },
) {
  const { orgSlug, payoutId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "BILLING_MANAGE"))
    return new Response("Interdit", { status: 403 });
  const owned = await db.venuePayout.findFirst({
    where: {
      id: payoutId,
      venuePartner: { organizationId: ctx.organization.id },
    },
    select: { id: true },
  });
  if (!owned) return new Response("Introuvable", { status: 404 });
  const pdf = await selfBillingPdf(payoutId);
  if (!pdf) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdf.number}.pdf"`,
    },
  });
}
