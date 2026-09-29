import { scannerManifest } from "@/server/scanner";
import { failure, json, linkOr410 } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await linkOr410(token);
  if (r.error) return r.error;
  try {
    return json(await scannerManifest(r.link));
  } catch (err) {
    return failure(err);
  }
}
