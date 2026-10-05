import { can } from "@evoly/core";
import { contactsCsv } from "@/server/contacts";
import { orgContextFromSession } from "@/server/context";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return new Response("Introuvable", { status: 404 });
  if (!can(ctx.membership, "CONTACTS_EXPORT")) return new Response("Accès refusé", { status: 403 });
  return new Response(await contactsCsv(ctx), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="contacts-${ctx.organization.slug}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
