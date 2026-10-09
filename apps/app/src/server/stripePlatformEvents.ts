import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { invoiceFailed, invoicePaid, invoiceSubscriptionId, syncSubscription, trialEnding } from "@/server/billing";

/** Événements du compte Stripe d'Evoly : abonnement Pro (RG-PAY-06, section 12), rejouables par la relance des webhooks. */
export async function handlePlatformEvent(e: Stripe.Event): Promise<"PROCESSED" | "IGNORED"> {
  switch (e.type) {
    case "checkout.session.completed": {
      const session = e.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) return "IGNORED";
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const s = stripe();
      if (!s) throw new Error("Stripe non configuré");
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
}
