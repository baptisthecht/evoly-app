import { safeError } from "@/lib/redact";
import { handleMollieWebhook } from "@/server/molliePayments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Mollie (docs/MOLLIE.md) : un formulaire qui ne porte que l'identifiant du paiement, relu chez Mollie avant
 * tout changement. 200 pour un identifiant inconnu ; 500 en cas d'erreur, et Mollie relance (10 fois en 26 heures).
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const id = form?.get("id");
  if (typeof id !== "string" || !id)
    return new Response("Identifiant manquant", { status: 400 });
  try {
    await handleMollieWebhook(id);
    return new Response("OK");
  } catch (err) {
    console.error("webhook Mollie", safeError(err));
    return new Response("Erreur", { status: 500 });
  }
}
