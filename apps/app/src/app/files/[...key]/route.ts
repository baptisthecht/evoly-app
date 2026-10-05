import { readLocalFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Fichiers importés, servis depuis le dossier local quand R2 n'est pas configuré (développement, tests). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const file = await readLocalFile(key.join("/"));
  if (!file) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "content-type": file.contentType, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
