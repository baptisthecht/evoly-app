import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";

type Outcome = "PROCESSED" | "IGNORED";

/**
 * Traitement idempotent d'un événement Stripe (RG-ARC-05, section 12) :
 * enregistré avant traitement, jamais traité deux fois, erreurs journalisées pour être rejouées.
 */
export async function processStripeEvent(event: Stripe.Event, handle: (event: Stripe.Event) => Promise<Outcome>): Promise<{ duplicate: boolean }> {
  const existing = await db.stripeWebhookEvent.findUnique({ where: { id: event.id } });
  if (existing && (existing.status === "PROCESSED" || existing.status === "IGNORED")) return { duplicate: true };
  if (!existing) {
    try {
      await db.stripeWebhookEvent.create({ data: { id: event.id, type: event.type, accountId: event.account ?? null } });
    } catch {
      return { duplicate: true }; // un autre processus vient de l'enregistrer
    }
  }
  try {
    const outcome = await handle(event);
    await db.stripeWebhookEvent.update({ where: { id: event.id }, data: { status: outcome, processedAt: new Date(), attempts: { increment: 1 }, lastError: null } });
  } catch (err) {
    await db.stripeWebhookEvent.update({ where: { id: event.id }, data: { status: "FAILED", attempts: { increment: 1 }, lastError: String(err).slice(0, 1000) } });
    throw err;
  }
  return { duplicate: false };
}
