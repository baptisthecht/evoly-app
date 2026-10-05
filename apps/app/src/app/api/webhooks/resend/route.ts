import { env } from "@/lib/env";
import { applyResendEvent, verifyResendSignature } from "@/server/emailEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Événements de délivrabilité de Resend : livraisons, ouvertures, clics, rebonds, plaintes. */
export async function POST(req: Request) {
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook non configuré", { status: 503 });
  const body = await req.text();
  const ok = verifyResendSignature(
    secret,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    body,
  );
  if (!ok) return new Response("Signature invalide", { status: 400 });
  try {
    return Response.json({ outcome: await applyResendEvent(JSON.parse(body)) });
  } catch (err) {
    console.error("webhook Resend", err instanceof Error ? err.message : "erreur");
    return new Response("Erreur", { status: 500 });
  }
}
