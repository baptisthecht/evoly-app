import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { processStripeEvent } from "@/server/webhooks";
import { handlePlatformEvent } from "@/server/stripePlatformEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Webhooks du compte plateforme Evoly : abonnement Pro (section 12). */
export async function POST(req: Request) {
  const s = stripe();
  const secret = env().STRIPE_WEBHOOK_SECRET_PLATFORM;
  const signature = req.headers.get("stripe-signature");
  if (!s || !secret || !signature) return new Response("Webhook non configuré", { status: 400 });
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return new Response("Signature invalide", { status: 400 });
  }
  // L'abonnement Pro (checkout.session.completed, customer.subscription.*, invoice.*) arrive à l'étape 7 du plan.
  await processStripeEvent(event, handlePlatformEvent);
  return Response.json({ received: true });
}
