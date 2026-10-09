import "server-only";
import { db } from "@/lib/db";
import { safeError } from "@/lib/redact";
import { stripe } from "@/lib/stripe";
import { handleConnectEvent } from "./stripeConnectEvents";
import { handlePlatformEvent } from "./stripePlatformEvents";
import { processStripeEvent } from "./webhooks";

/**
 * Section 11 : relance des webhooks en échec, toutes les 5 minutes, jusqu'à 10 tentatives sur 3 jours.
 * L'événement est relu chez Stripe (sur le compte connecté s'il y a lieu) puis rejoué par le même traitement que les routes.
 */
export async function retryFailedWebhooks(now = new Date(), limit = 50) {
  const s = stripe();
  if (!s) return { retried: 0, failed: 0 };
  const due = await db.stripeWebhookEvent.findMany({
    where: { status: "FAILED", attempts: { lt: 10 }, receivedAt: { gt: new Date(now.getTime() - 3 * 86_400_000) } },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });
  let retried = 0;
  let failed = 0;
  for (const w of due) {
    try {
      const event = await s.events.retrieve(w.id, undefined, w.accountId ? { stripeAccount: w.accountId } : undefined);
      await processStripeEvent(event, w.accountId ? handleConnectEvent : handlePlatformEvent);
      retried++;
    } catch (err) {
      failed++;
      console.error("webhook toujours en échec", w.id, safeError(err));
    }
  }
  return { retried, failed };
}
