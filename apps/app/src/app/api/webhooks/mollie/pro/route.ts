import { safeError } from "@/lib/redact";
import { handleProWebhook } from "@/server/proBilling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook des paiements de l'offre Pro, sur le compte Mollie d'Evoly (docs/MOLLIE.md, lot 6) : l'identifiant seul, état
 * relu chez Mollie. 200 pour un identifiant inconnu ; 500 en cas d'erreur, et Mollie relance (10 fois en 26 heures).
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const id = form?.get("id");
  if (typeof id !== "string" || !id)
    return new Response("Identifiant manquant", { status: 400 });
  try {
    await handleProWebhook(id);
    return new Response("OK");
  } catch (err) {
    console.error("webhook Mollie de l'offre Pro", safeError(err));
    return new Response("Erreur", { status: 500 });
  }
}
