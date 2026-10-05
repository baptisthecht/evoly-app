import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { env } from "@/lib/env";

let client: AwsClient | null | undefined;
function r2(): AwsClient | null {
  const e = env();
  if (client === undefined)
    client =
      e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY
        ? new AwsClient({ accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" })
        : null;
  return client;
}
const localDir = () => env().UPLOADS_DIR ?? "/tmp/evoly-uploads";
const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;

export function publicFileUrl(key: string): string {
  const e = env();
  return e.R2_PUBLIC_URL ? `${e.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}` : `${e.NEXT_PUBLIC_APP_URL}/files/${key}`;
}

/** Dépôt d'un fichier public (logo, image) : Cloudflare R2 en production, dossier local sinon. */
export async function putPublicFile(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("clé de fichier invalide");
  const c = r2();
  if (c) {
    const e = env();
    const res = await c.fetch(`https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${e.R2_BUCKET}/${key}`, {
      method: "PUT",
      body: new Blob([new Uint8Array(bytes)]),
      headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!res.ok) throw new Error(`dépôt R2 refusé (${res.status})`);
  } else {
    const file = path.join(localDir(), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    await writeFile(`${file}.type`, contentType);
  }
  return publicFileUrl(key);
}

/** Lecture d'un fichier du dossier local (développement, tests). */
export async function readLocalFile(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  // servi même quand R2 est configuré : les fichiers importés avant le passage au bucket restent accessibles
  if (!SAFE_KEY.test(key) || key.includes("..")) return null;
  const file = path.join(localDir(), key);
  try {
    return { bytes: await readFile(file), contentType: (await readFile(`${file}.type`, "utf8")).trim() };
  } catch {
    return null;
  }
}

export async function deletePublicFile(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const prefix = publicFileUrl("");
  if (!url.startsWith(prefix)) return;
  const key = url.slice(prefix.length);
  const c = r2();
  try {
    if (c) await c.fetch(`https://${env().R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env().R2_BUCKET}/${key}`, { method: "DELETE" });
    else if (SAFE_KEY.test(key) && !key.includes("..")) await Promise.all([unlink(path.join(localDir(), key)), unlink(path.join(localDir(), `${key}.type`))]);
  } catch {
    /* fichier déjà absent */
  }
}
