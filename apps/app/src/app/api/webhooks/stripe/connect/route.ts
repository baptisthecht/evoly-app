import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { processStripeEvent } from "@/server/webhooks";
import { handleConnectEvent } from "@/server/stripeConnectEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Webhooks des comptes connectés des organisateurs (RG-PAY-07, section 12). */
export async function POST(req: Request) {
  const s = stripe();
  const secret = env().STRIPE_WEBHOOK_SECRET_CONNECT;
  const signature = req.headers.get("stripe-signature");
  if (!s || !secret || !signature) return new Response("Webhook non configuré", { status: 400 });
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return new Response("Signature invalide", { status: 400 });
  }
  await processStripeEvent(event, handleConnectEvent);
  return Response.json({ received: true });
}
