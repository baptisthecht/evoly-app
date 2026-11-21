import { safeError } from "@/lib/redact";
import { handleShopMollieWebhook } from "@/server/shopCheckout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Mollie des paiements de la boutique (docs/MOLLIE.md) : un formulaire qui ne porte que l'identifiant du
 * paiement, la commande étant dans l'adresse ; le paiement est relu chez Mollie avant tout changement. 200 pour un
 * identifiant inconnu ; 500 en cas d'erreur, et Mollie relance (10 fois en 26 heures).
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const id = form?.get("id");
  if (typeof id !== "string" || !id)
    return new Response("Identifiant manquant", { status: 400 });
  try {
    await handleShopMollieWebhook(
      id,
      new URL(req.url).searchParams.get("commande"),
    );
    return new Response("OK");
  } catch (err) {
    console.error("webhook Mollie (boutique)", safeError(err));
    return new Response("Erreur", { status: 500 });
  }
}
