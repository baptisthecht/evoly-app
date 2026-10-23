import { can, CoreError, hasFeature } from "@evoly/core";
import { orgContextFromSession } from "@/server/context";
import { precreatedCodesCsv } from "@/server/distributors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Codes créés à l'avance d'un réseau, en CSV pour impression par le réseau (docs/COMPATIBILITE_RESEAUX.md). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string; eventId: string }> },
) {
  const { orgSlug, eventId } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!can(ctx.membership, "EVENTS_EDIT"))
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!hasFeature(ctx.features, "DISTRIBUTION"))
    return Response.json({ error: "PRO_REQUIRED" }, { status: 403 });
  const distributorId = new URL(req.url).searchParams.get("distributor") ?? "";
  try {
    const { name, csv } = await precreatedCodesCsv(ctx, eventId, distributorId);
    const file = `codes-${name
      .normalize("NFD")
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()}.csv`;
    return new Response(`\ufeff${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${file}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof CoreError)
      return Response.json(
        { error: e.code },
        { status: e.code === "NOT_FOUND" ? 404 : 400 },
      );
    throw e;
  }
}
