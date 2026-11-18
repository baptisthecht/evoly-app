import { can } from "@evoly/core";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { proInvoicePdf } from "@/server/proInvoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Facture de l'offre Pro (docs/MOLLIE.md, lot 6), pour l'organisation concernée seulement. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string; invoiceId: string }> },
) {
  const { orgSlug, invoiceId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (
    !can(ctx.membership, "BILLING_MANAGE") &&
    !can(ctx.membership, "FINANCE_VIEW")
  )
    return new Response("Interdit", { status: 403 });
  const owned = await db.proInvoice.findFirst({
    where: { id: invoiceId, organizationId: ctx.organization.id },
    select: { id: true },
  });
  if (!owned) return new Response("Introuvable", { status: 404 });
  const pdf = await proInvoicePdf(owned.id);
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdf.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
