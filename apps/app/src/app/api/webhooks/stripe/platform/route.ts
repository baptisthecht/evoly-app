import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { invoiceFailed, invoicePaid, invoiceSubscriptionId, syncSubscription, trialEnding } from "@/server/billing";
import { processStripeEvent } from "@/server/webhooks";

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
  await processStripeEvent(event, async (e) => {
    switch (e.type) {
      case "checkout.session.completed": {
        const session = e.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) return "IGNORED";
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        return (await syncSubscription(await s.subscriptions.retrieve(id))) ? "PROCESSED" : "IGNORED";
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return (await syncSubscription(e.data.object as Stripe.Subscription)) ? "PROCESSED" : "IGNORED";
      case "customer.subscription.trial_will_end":
        await trialEnding(e.data.object as Stripe.Subscription);
        return "PROCESSED";
      case "invoice.paid":
        await invoicePaid(invoiceSubscriptionId(e.data.object as unknown as Parameters<typeof invoiceSubscriptionId>[0]));
        return "PROCESSED";
      case "invoice.payment_failed":
        await invoiceFailed(invoiceSubscriptionId(e.data.object as unknown as Parameters<typeof invoiceSubscriptionId>[0]));
        return "PROCESSED";
      default:
        return "IGNORED";
    }
  });
  return Response.json({ received: true });
}
