import "server-only";
import type Stripe from "stripe";
import { notify } from "@/server/notifications";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { audit } from "@/server/audit";
import { syncStripeAccount } from "@/server/stripeConnect";
import { completeOrder, stripeFeesForCharge } from "@/server/orders";
import { syncStripeRefund } from "@/server/refunds";
import { upsertDispute } from "@/server/finances";

/** Événements des comptes connectés des organisateurs (RG-PAY-07, section 12), rejouables par la relance des webhooks. */
export async function handleConnectEvent(e: Stripe.Event): Promise<"PROCESSED" | "IGNORED"> {
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
      await audit({
        action: "stripe.account_deauthorized",
        organizationId: known.organizationId,
        actorType: "STRIPE",
        targetType: "StripeAccount",
        targetId: e.account,
      });
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
      await completeOrder(orderId, {
        paymentIntentId: pi.id,
        amountMinor: pi.amount_received,
        currency: pi.currency,
        chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null),
        paymentMethodType: pi.payment_method_types[0] ?? null,
      });
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
      await upsertDispute({
        id: d.id,
        charge: typeof d.charge === "string" ? d.charge : d.charge.id,
        account: e.account,
        amount: d.amount,
        currency: d.currency,
        reason: d.reason,
        status: d.status,
        dueBy: d.evidence_details?.due_by ?? null,
      });
      return "PROCESSED";
    }
    case "payment_intent.payment_failed":
      // RG-BUY-06 : la réservation est conservée jusqu'à son expiration, l'acheteur peut réessayer
      return "PROCESSED";
    case "payment_intent.canceled": {
      // section 12 : réservation libérée aussitôt (la tâche des réservations la remet en vente dans la minute)
      const orderId = (e.data.object as Stripe.PaymentIntent).metadata?.orderId;
      if (!orderId) return "IGNORED";
      await db.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { holdExpiresAt: new Date() } });
      return "PROCESSED";
    }
    case "payout.paid":
      // RG-PAY-04 : les virements sont lus chez Stripe dans Finances, rien à enregistrer
      return "PROCESSED";
    case "payout.failed": {
      // RG-PAY-04 et section 12 : virement échoué signalé au propriétaire et aux administrateurs, e-mail compris
      const p = e.data.object as Stripe.Payout;
      const acct = e.account ? await db.stripeAccount.findUnique({ where: { stripeAccountId: e.account }, select: { organizationId: true } }) : null;
      if (!acct) return "IGNORED";
      await notify(acct.organizationId, "PAYOUT_FAILED", {
        title: "Virement échoué",
        body: `Le virement de ${(p.amount / 100).toFixed(2).replace(".", ",")} ${p.currency.toUpperCase()} vers votre banque a échoué${p.failure_message ? ` : ${p.failure_message}` : ""}. Vérifiez vos coordonnées bancaires dans votre tableau de bord Stripe.`,
        link: "/finances",
      });
      return "PROCESSED";
    }
    default:
      return "IGNORED";
  }
}
