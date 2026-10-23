import { z } from "zod";
import { syncOptionRedemptions } from "@/server/options";
import { syncScans } from "@/server/scanner";
import {
  failure,
  json,
  linkOr410,
  rateLimited,
  scanSchema,
} from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const syncSchema = z.object({
  deviceId: z.string().max(64).nullish(),
  scans: z
    .array(scanSchema.extend({ clientId: z.string().min(1).max(64) }))
    .max(500),
  // retraits au bar faits sans réseau (RG-OPT-05)
  redemptions: z
    .array(
      z.object({
        clientId: z.string().min(1).max(64),
        orderOptionId: z.string().min(1).max(40),
        quantity: z.number().int().min(1).max(20),
        at: z.string().max(40),
      }),
    )
    .max(500)
    .default([]),
});

/** Scans faits hors ligne, envoyés au retour du réseau (RG-SCN-03). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const r = await linkOr410(token);
  if (r.error) return r.error;
  const parsed = syncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "INVALID_INPUT" }, 400);
  if (await rateLimited(r.link.id, parsed.data.deviceId, 3))
    return json({ error: "RATE_LIMITED" }, 429);
  try {
    return json({
      results: await syncScans(
        r.link,
        parsed.data.scans.map((s) => ({
          ...s,
          deviceId: s.deviceId ?? parsed.data.deviceId,
        })),
      ),
      // un lien de vérification seule ne retire rien ; la personne est le libellé du lien, comme au bar en ligne
      redemptions: r.link.checkOnly
        ? []
        : await syncOptionRedemptions(
            r.link.eventId,
            parsed.data.redemptions.map((x) => ({
              ...x,
              deviceId: parsed.data.deviceId ?? null,
              staffName: r.link.label,
            })),
          ),
    });
  } catch (err) {
    return failure(err);
  }
}
