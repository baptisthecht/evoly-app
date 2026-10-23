import { can, CoreError, hasFeature } from "@evoly/core";
import { revalidatePath } from "next/cache";
import { orgContextFromSession } from "@/server/context";
import { importExternalTickets } from "@/server/externalImport";
import { MAX_IMPORT_BYTES, type ColumnMap } from "@/server/importFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = new Set([
  "code",
  "reservation",
  "firstName",
  "lastName",
  "fullName",
  "tarif",
  "price",
  "seat",
  "row",
  "quantity",
]);

/** Colonnes confirmées par l'organisateur : uniquement des champs connus et des numéros de colonne. */
function mappingOf(raw: FormDataEntryValue | null): ColumnMap | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map: ColumnMap = {};
    for (const [k, v] of Object.entries(parsed))
      if (
        FIELDS.has(k) &&
        Number.isInteger(v) &&
        (v as number) >= 0 &&
        (v as number) < 200
      )
        map[k as keyof ColumnMap] = v as number;
    return map;
  } catch {
    return undefined;
  }
}

/** Import des billets vendus par un réseau (docs/COMPATIBILITE_RESEAUX.md) : route plutôt qu'action, pour les fichiers de plus d'1 Mo. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string; eventId: string }> },
) {
  const { orgSlug, eventId } = await params;
  const ctx = await orgContextFromSession(orgSlug);
  if (!ctx) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!can(ctx.membership, "EVENTS_EDIT") || ctx.readOnly)
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!hasFeature(ctx.features, "DISTRIBUTION"))
    return Response.json({ error: "PRO_REQUIRED" }, { status: 403 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMPORT_BYTES + 64 * 1024)
    return Response.json({ error: "IMPORT_FILE_TOO_LARGE" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const distributorId = String(form?.get("distributorId") ?? "");
  if (!(file instanceof File) || !distributorId)
    return Response.json({ error: "IMPORT_FILE_EMPTY" }, { status: 400 });
  if (file.size > MAX_IMPORT_BYTES)
    return Response.json({ error: "IMPORT_FILE_TOO_LARGE" }, { status: 413 });
  try {
    const report = await importExternalTickets(
      ctx,
      eventId,
      distributorId,
      { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      {
        mapping: mappingOf(form!.get("mapping")),
        header: form!.get("header") !== "0",
        fullFile: form!.get("fullFile") === "1",
      },
    );
    revalidatePath(`/o/${orgSlug}/events/${eventId}/distribution`);
    return Response.json({ report });
  } catch (e) {
    if (e instanceof CoreError)
      return Response.json({ error: e.code }, { status: 400 });
    throw e;
  }
}
