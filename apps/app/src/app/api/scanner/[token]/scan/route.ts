import { checkIn } from "@/server/scanner";
import { failure, json, linkOr410, rateLimited, scanSchema } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await linkOr410(token);
  if (r.error) return r.error;
  const parsed = scanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "INVALID_INPUT" }, 400);
  if (await rateLimited(r.link.id, parsed.data.deviceId)) return json({ error: "RATE_LIMITED" }, 429);
  try {
    return json(await checkIn(r.link, parsed.data));
  } catch (err) {
    return failure(err);
  }
}
