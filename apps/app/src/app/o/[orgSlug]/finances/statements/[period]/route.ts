import { can, CoreError } from "@evoly/core";
import { orgContextFromSession } from "@/server/context";
import { issueStatement, statementPdf } from "@/server/finances";

export const dynamic = "force-dynamic";

/** RG-FEE-31 : PDF du relevé d'un mois clos, émis à la première demande s'il ne l'est pas encore. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgSlug: string; period: string }> }) {
  const { orgSlug, period } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return new Response("Introuvable", { status: 404 });
  if (!can(ctx.membership, "FINANCE_VIEW")) return new Response("Accès refusé", { status: 403 });
  try {
    const statement = await issueStatement(ctx.organization.id, period, ctx.organization.currency);
    const { bytes, number } = await statementPdf(statement.id);
    return new Response(Buffer.from(bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${number}.pdf"`, "cache-control": "private, no-store" },
    });
  } catch (err) {
    if (err instanceof CoreError) return new Response(err.code, { status: err.code === "NOT_FOUND" ? 404 : 409 });
    throw err;
  }
}
