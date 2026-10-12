import { z } from "zod";
import { optionsForScan, redeemOption } from "@/server/options";
import { failure, json, linkOr410, rateLimited } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mode « Bar et options » du scanner (section 9.29) : consulter ce qui reste sur un billet, ou retirer une quantité. */
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("lookup"),
    code: z.string().max(200).optional(),
    shortCode: z.string().max(20).optional(),
    deviceId: z.string().max(80).optional(),
  }),
  z.object({
    action: z.literal("redeem"),
    orderOptionId: z.string().max(40),
    quantity: z.number().int().min(1).max(100),
    deviceId: z.string().max(80).optional(),
  }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await linkOr410(token);
  if (r.error) return r.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "INVALID_INPUT" }, 400);
  if (await rateLimited(r.link.id, parsed.data.deviceId)) return json({ error: "RATE_LIMITED" }, 429);
  try {
    if (parsed.data.action === "lookup") return json(await optionsForScan(r.link.eventId, parsed.data));
    if (r.link.checkOnly) return json({ error: "CHECK_ONLY" }, 403); // un lien de vérification seule ne retire rien
    return json(
      await redeemOption(r.link.eventId, parsed.data.orderOptionId, parsed.data.quantity, { deviceId: parsed.data.deviceId, staffName: r.link.label }),
    );
  } catch (err) {
    return failure(err);
  }
}
