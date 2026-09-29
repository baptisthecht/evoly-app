import { z } from "zod";
import { syncScans } from "@/server/scanner";
import { failure, json, linkOr410, rateLimited, scanSchema } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const syncSchema = z.object({ deviceId: z.string().max(64).nullish(), scans: z.array(scanSchema.extend({ clientId: z.string().min(1).max(64) })).max(500) });

/** Scans faits hors ligne, envoyés au retour du réseau (RG-SCN-03). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await linkOr410(token);
  if (r.error) return r.error;
  const parsed = syncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "INVALID_INPUT" }, 400);
  if (await rateLimited(r.link.id, parsed.data.deviceId, 3)) return json({ error: "RATE_LIMITED" }, 429);
  try {
    return json({ results: await syncScans(r.link, parsed.data.scans.map((s) => ({ ...s, deviceId: s.deviceId ?? parsed.data.deviceId }))) });
  } catch (err) {
    return failure(err);
  }
}
