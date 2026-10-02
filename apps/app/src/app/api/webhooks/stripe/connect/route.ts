import type Stripe from "stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { audit } from "@/server/audit";
import { syncStripeAccount } from "@/server/stripeConnect";
import { completeOrder, stripeFeesForCharge } from "@/server/orders";
import { syncStripeRefund } from "@/server/refunds";
import { upsertDispute } from "@/server/finances";
import { processStripeEvent } from "@/server/webhooks";

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
  await processStripeEvent(event, async (e) => {
    switch (e.type) {
      case "account.updated": {
        const account = e.data.object as Stripe.Account;
        const known = await db.stripeAccount.findUnique({ where: { stripeAccountId: account.id }, select: { organizationId: true } });
        if (!known) return "IGNORED";
        await syncStripeAccount(account);
        return "PROCESSED";
      }
      case "account.application.deauthorized": {
        if (!e.account) return "IGNORED";
        const known = await db.stripeAccount.findUnique({ where: { stripeAccountId: e.account }, select: { organizationId: true } });
        if (!known) return "IGNORED";
        await db.stripeAccount.update({ where: { stripeAccountId: e.account }, data: { status: "DISABLED", chargesEnabled: false, payoutsEnabled: false } });
        await audit({ action: "stripe.account_deauthorized", organizationId: known.organizationId, actorType: "STRIPE", targetType: "StripeAccount", targetId: e.account });
        return "PROCESSED";
      }
      case "charge.updated": {
        // la transaction du paiement (frais Stripe) est créée : frais et net enregistrés sur la commande
        const ch = e.data.object as Stripe.Charge;
        return ch.balance_transaction && (await stripeFeesForCharge(ch.id)) ? "PROCESSED" : "IGNORED";
      }
      case "payment_intent.succeeded": {
        // RG-BUY-07 : validation unique de la commande (le paiement peut arriver avant ou après le retour de l'acheteur)
        const pi = e.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (!orderId) return "IGNORED";
        await completeOrder(orderId, { paymentIntentId: pi.id, amountMinor: pi.amount_received, currency: pi.currency, chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null), paymentMethodType: pi.payment_method_types[0] ?? null });
        return "PROCESSED";
      }
      case "charge.refund.updated":
      case "refund.updated":
      case "refund.failed": {
        // RG-REF-03 : état final du remboursement (réussi, échoué)
        const r = e.data.object as Stripe.Refund;
        return (await syncStripeRefund(r.id, r.status ?? "pending", r.failure_reason)) ? "PROCESSED" : "IGNORED";
      }
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed": {
        // RG-FIN-03 : litiges listés dans la page Finances, avec leur échéance
        const d = e.data.object as Stripe.Dispute;
        if (!e.account) return "IGNORED";
        await upsertDispute({ id: d.id, charge: typeof d.charge === "string" ? d.charge : d.charge.id, account: e.account, amount: d.amount, currency: d.currency, reason: d.reason, status: d.status, dueBy: d.evidence_details?.due_by ?? null });
        return "PROCESSED";
      }
      case "payment_intent.payment_failed":
        // RG-BUY-06 : la réservation est conservée jusqu'à son expiration, l'acheteur peut réessayer
        return "PROCESSED";
      default:
        // remboursements, litiges, virements : traités avec les étapes suivantes
        return "IGNORED";
    }
  });
  return Response.json({ received: true });
}
