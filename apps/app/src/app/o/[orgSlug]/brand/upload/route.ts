import { can, CoreError, hasFeature } from "@evoly/core";
import { uploadImage, type UploadKind } from "@/server/brand";
import { orgContextFromSession } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Import d'un logo, d'un favicon (Pro) ou d'une image de couverture d'événement. */
export async function POST(req: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "") as UploadKind;
  if (!(file instanceof File) || !["logo", "favicon", "cover", "campaign"].includes(kind)) return Response.json({ error: "UPLOAD_INVALID" }, { status: 400 });
  const allowed =
    kind === "cover"
      ? can(ctx.membership, "EVENTS_EDIT")
      : kind === "campaign"
        ? can(ctx.membership, "MARKETING_MANAGE") && hasFeature(ctx.features, "EMAIL_MARKETING")
        : can(ctx.membership, "BRAND_EDIT") && hasFeature(ctx.features, "BRANDING");
  if (!allowed || ctx.readOnly) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    const url = await uploadImage(ctx, kind, new Uint8Array(await file.arrayBuffer()), String(form?.get("eventId") ?? "") || null);
    return Response.json({ url });
  } catch (err) {
    if (err instanceof CoreError) return Response.json({ error: err.code }, { status: 400 });
    throw err;
  }
}
