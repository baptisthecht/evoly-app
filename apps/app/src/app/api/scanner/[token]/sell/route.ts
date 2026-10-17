import { z } from "zod";
import { qrSaleStatus, sellCash, startQrSale } from "@/server/boxOffice";
import { failure, json, linkOr410, rateLimited } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vente sur place depuis le scanner (section 9.27) : en espèces, réservée aux liens qui y sont autorisés. */
const schema = z.object({
  action: z.enum(["cash", "qr"]),
  lines: z.array(z.object({ ticketTypeId: z.string().max(40), quantity: z.number().int().min(1).max(50) })).max(20),
  // options vendables sans billet, contrôlées par la réservation (RG-OPT-03)
  options: z
    .array(z.object({ optionId: z.string().max(40), quantity: z.number().int().min(1).max(20) }))
    .max(20)
    .default([]),
  email: z.string().max(200).optional(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  deviceId: z.string().max(80).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await linkOr410(token);
  if (r.error) return r.error;
  if (!r.link.canSell || r.link.checkOnly) return json({ error: "BOX_OFFICE_FORBIDDEN" }, 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.lines.length === 0 && parsed.data.options.length === 0)) return json({ error: "INVALID_INPUT" }, 400);
  if (await rateLimited(r.link.id, parsed.data.deviceId)) return json({ error: "RATE_LIMITED" }, 429);
  try {
    return json(parsed.data.action === "qr" ? await startQrSale(r.link, parsed.data) : await sellCash(r.link, parsed.data));
  } catch (err) {
    return failure(err);
  }
}

/** Suivi d'un paiement par QR code lancé par ce lien. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await linkOr410(token);
  if (r.error) return r.error;
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order")?.slice(0, 40) ?? "";
  if (!orderId) return json({ error: "INVALID_INPUT" }, 400);
  try {
    return json(await qrSaleStatus(r.link, orderId, url.searchParams.get("device")?.slice(0, 80)));
  } catch (err) {
    return failure(err);
  }
}
