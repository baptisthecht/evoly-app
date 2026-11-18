import "server-only";
import { CoreError, mollieApplicationFee } from "@evoly/core";
import type { MollieAccount } from "@evoly/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  fromMollieAmount,
  mollieApi,
  mollieLocale,
  toMollieAmount,
  type MollieApi,
  type MollieList,
  type MolliePayment,
  type MollieRefund,
} from "@/lib/mollie";
import {
  mollieAccessToken,
  mollieForOrganization,
  mollieReady,
} from "./mollieAccounts";

/**
 * Paiement des billets par Mollie (docs/MOLLIE.md, lot 3) : paiement créé sur le compte Mollie de l'organisateur, avec
 * la commission d'Evoly en frais d'application, payé sur la page de Mollie ; validé au retour de l'acheteur ou par le
 * webhook, toujours après relecture du paiement chez Mollie.
 */

/** Durée de vie d'un paiement par carte chez Mollie : la réservation tient au moins jusque-là. */
export const MOLLIE_HOLD_MS = 15 * 60_000;

export type PaymentAccount =
  | { provider: "MOLLIE"; account: MollieAccount }
  | { provider: "STRIPE"; stripeAccountId: string }
  | null;

/**
 * Compte qui encaisse les billets d'une organisation : son compte Mollie s'il est prêt, sinon son ancien compte Stripe
 * s'il encaisse encore (jusqu'au retrait de Stripe), sinon aucun.
 */
export async function paymentAccountFor(
  organizationId: string,
): Promise<PaymentAccount> {
  const [mollie, stripe] = await Promise.all([
    db.mollieAccount.findUnique({ where: { organizationId } }),
    db.stripeAccount.findUnique({
      where: { organizationId },
      select: { stripeAccountId: true, chargesEnabled: true },
    }),
  ]);
  if (mollie && mollieReady(mollie))
    return { provider: "MOLLIE", account: mollie };
  if (stripe?.chargesEnabled)
    return { provider: "STRIPE", stripeAccountId: stripe.stripeAccountId };
  return null;
}

/** Adresse du webhook Mollie ; aucune en local (Mollie refuse une adresse qui n'est pas publique). */
export function mollieWebhookUrl(): string | undefined {
  const app = env().NEXT_PUBLIC_APP_URL;
  if (!app.startsWith("https://") || /\/\/(localhost|127\.0\.0\.1)\b/.test(app))
    return undefined;
  return `${app}/api/webhooks/mollie`;
}

/**
 * Paiement Mollie d'une commande : celui déjà ouvert est repris ; annulé, expiré ou échoué, un nouveau est créé. Rend
 * l'adresse de la page de paiement de Mollie, ou PAID si Mollie l'a déjà encaissé.
 */
export async function startMolliePayment(input: {
  account: MollieAccount;
  order: {
    id: string;
    reference: string;
    organizationId: string;
    eventId: string;
    totalMinor: number;
    applicationFeeMinor: number;
    currency: string;
    molliePaymentId: string | null;
    buyerLocale: string | null;
  };
  title: string;
  country: string;
  returnUrl: string;
}): Promise<{ kind: "PAID" } | { kind: "REDIRECT"; url: string }> {
  const { account, order } = input;
  if (!account.profileId) throw new CoreError("PAYMENTS_UNAVAILABLE");
  const api = mollieApi(await mollieAccessToken(account), account.testmode);
  if (order.molliePaymentId) {
    const existing = await api<MolliePayment>(
      `/payments/${order.molliePaymentId}`,
    );
    if (existing.status === "paid") return { kind: "PAID" };
    if (
      (existing.status === "open" || existing.status === "pending") &&
      existing._links.checkout
    )
      return { kind: "REDIRECT", url: existing._links.checkout.href };
  }
  const fee = mollieApplicationFee(order.totalMinor, order.applicationFeeMinor);
  const webhookUrl = mollieWebhookUrl();
  const payment = await api<MolliePayment>("/payments", {
    body: {
      amount: toMollieAmount(order.totalMinor, order.currency),
      description: `${input.title} · ${order.reference}`.slice(0, 255),
      redirectUrl: input.returnUrl,
      ...(webhookUrl ? { webhookUrl } : {}),
      locale: mollieLocale(order.buyerLocale ?? "fr", input.country),
      profileId: account.profileId,
      metadata: {
        orderId: order.id,
        reference: order.reference,
        eventId: order.eventId,
        organizationId: order.organizationId,
      },
      ...(fee > 0
        ? {
            applicationFee: {
              amount: toMollieAmount(fee, order.currency),
              description: `Evoly ${order.reference}`,
            },
          }
        : {}),
    },
    idempotencyKey: `order:${order.id}:mollie-payment:${order.molliePaymentId ?? "1"}`,
  });
  const checkout = payment._links.checkout?.href;
  if (!checkout) throw new CoreError("PAYMENTS_UNAVAILABLE");
  await db.order.update({
    where: { id: order.id },
    data: {
      molliePaymentId: payment.id,
      paymentProvider: "MOLLIE",
      // commission ramenée au plafond de Mollie (très petite commande) : les relevés suivent ce qui est encaissé
      ...(fee !== order.applicationFeeMinor
        ? { applicationFeeMinor: fee }
        : {}),
    },
  });
  return { kind: "REDIRECT", url: checkout };
}

/**
 * Paiement relu chez Mollie (retour de l'acheteur, webhook) : payé, la commande est validée (RG-BUY-08), avec le moyen
 * de paiement et l'empreinte de la carte (personnes bloquées, limites par acheteur). Rend l'état du paiement chez
 * Mollie, ou null sans paiement Mollie.
 */
export async function syncPaymentFromMollie(
  orderId: string,
): Promise<MolliePayment["status"] | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, molliePaymentId: true, organizationId: true },
  });
  if (!order?.molliePaymentId) return null;
  const mollie = await mollieForOrganization(order.organizationId);
  if (!mollie) return null;
  const payment = await mollie.api<MolliePayment>(
    `/payments/${order.molliePaymentId}`,
  );
  // remboursement d'une commande déjà payée : Mollie appelle le même webhook quand son état change (lot 4)
  if (["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.status)) {
    await syncMollieRefunds(orderId, order.molliePaymentId, mollie.api);
    return payment.status;
  }
  if (
    payment.status === "paid" &&
    ["PENDING", "EXPIRED", "FAILED"].includes(order.status)
  ) {
    // import différé : orders.ts dépend du module de paiement (checkout.ts)
    const { completeOrder } = await import("./orders");
    await completeOrder(orderId, {
      molliePaymentId: payment.id,
      amountMinor: fromMollieAmount(payment.amount),
      currency: payment.amount.currency,
      paymentMethodType: payment.method,
      cardFingerprint: payment.details?.cardFingerprint ?? null,
    });
  }
  return payment.status;
}

/**
 * Webhook Mollie : seul l'identifiant arrive, le paiement est relu avec le jeton de son organisateur. Un identifiant
 * inconnu est ignoré (Mollie conseille de répondre 200) ; une erreur remonte, et Mollie relance plus tard.
 */
export async function handleMollieWebhook(id: string): Promise<void> {
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return;
  const order = await db.order.findUnique({
    where: { molliePaymentId: id },
    select: { id: true },
  });
  if (order) await syncPaymentFromMollie(order.id);
}

/** État d'un remboursement Evoly selon celui de Mollie (« queued » : en attente d'un solde suffisant). */
export function refundStatusFromMollie(
  status: MollieRefund["status"],
): "SUCCEEDED" | "PROCESSING" | "FAILED" {
  if (status === "refunded") return "SUCCEEDED";
  if (status === "failed" || status === "canceled") return "FAILED";
  return "PROCESSING";
}

/**
 * Remboursement sur le paiement Mollie d'une commande (acheteur, vendeur d'une revente), pris sur le solde de
 * l'organisateur. Mollie ne rend jamais la commission d'Evoly (frais d'application). La clé d'idempotence évite un
 * double remboursement si l'appel est rejoué.
 */
export async function createMollieRefund(input: {
  orderId: string;
  amountMinor: number;
  description: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}): Promise<MollieRefund> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: input.orderId },
    select: { molliePaymentId: true, organizationId: true, currency: true },
  });
  const mollie = await mollieForOrganization(order.organizationId);
  if (!order.molliePaymentId || !mollie)
    throw new CoreError("PAYMENTS_UNAVAILABLE");
  return mollie.api<MollieRefund>(
    `/payments/${order.molliePaymentId}/refunds`,
    {
      body: {
        amount: toMollieAmount(input.amountMinor, order.currency),
        description: input.description.slice(0, 140),
        metadata: input.metadata,
      },
      idempotencyKey: input.idempotencyKey,
    },
  );
}

/**
 * Remboursement intégral d'un paiement Mollie (paiement tardif sans place, carte bloquée). Mollie ne rend jamais la
 * commission d'Evoly : elle revient à l'organisateur sur son relevé mensuel (docs/MOLLIE.md).
 */
export async function refundMollieInFull(
  orderId: string,
  cause: "unfulfilled" | "blocked",
): Promise<void> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { totalMinor: true, reference: true },
  });
  await createMollieRefund({
    orderId,
    amountMinor: order.totalMinor,
    description: `Remboursement ${order.reference}`,
    metadata: { orderId, cause },
    idempotencyKey: `order:${orderId}:${cause}-refund`,
  });
}

/**
 * États des remboursements Mollie d'une commande, relus sur son paiement : remboursements de l'acheteur (Refund) et du
 * vendeur d'une revente. Un remboursement fait directement chez Mollie, inconnu d'Evoly, est ignoré.
 */
async function syncMollieRefunds(
  orderId: string,
  molliePaymentId: string,
  api: MollieApi,
): Promise<void> {
  const pending = await db.refund.count({
    where: { orderId, mollieRefundId: { not: null }, status: "PROCESSING" },
  });
  if (pending === 0) return;
  const list = await api<MollieList<"refunds", MollieRefund>>(
    `/payments/${molliePaymentId}/refunds`,
    { query: { limit: 250 } },
  );
  for (const r of list._embedded.refunds) {
    const status = refundStatusFromMollie(r.status);
    await db.refund.updateMany({
      where: { mollieRefundId: r.id, status: "PROCESSING" },
      data: {
        status,
        failureReason: status === "FAILED" ? "échec Mollie" : null,
      },
    });
  }
}
