import "server-only";
import {
  addBillingInterval,
  CoreError,
  effectivePlan,
  firstPeriodStart,
  nextRenewalAttempt,
  PAST_DUE_GRACE_DAYS,
  RENEWAL_LEAD_MS,
  renewsWithMollie,
  trialEligible,
  type BillingInterval,
} from "@evoly/core";
import { Prisma, type Subscription, type SubscriptionPayment } from "@evoly/db";
import { formatDate, formatMoney } from "@evoly/i18n";
import { db } from "@/lib/db";
import {
  evolyMollie,
  fromMollieAmount,
  MollieError,
  mollieLocale,
  toMollieAmount,
  type MollieApi,
  type MollieList,
  type MolliePayment,
} from "@/lib/mollie";
import { safeError } from "@/lib/redact";
import { stripe } from "@/lib/stripe";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { mollieWebhookUrl } from "./molliePayments";
import { notify } from "./notifications";
import { issueProInvoice } from "./proInvoices";
import { billingUrl, notifyOwner, subscriptionOwner } from "./subscriptionMail";

/**
 * Offre Pro payée par Mollie (docs/MOLLIE.md, lot 6), sur le compte Mollie d'Evoly : essai de 14 jours sans carte,
 * premier paiement sur la page de Mollie (carte, Bancontact…) qui crée le mandat, puis chaque renouvellement prélevé par
 * Evoly sur ce mandat (carte, ou prélèvement SEPA après Bancontact). Evoly tient les périodes : passage au mensuel ou à
 * l'annuel au renouvellement, sans prorata ; résiliation en fin de période ; facture numérotée à chaque paiement reçu.
 */

/** Paiement Mollie avec les champs des paiements récurrents. */
type ProPayment = MolliePayment & {
  customerId?: string | null;
  mandateId?: string | null;
  sequenceType?: "oneoff" | "first" | "recurring";
  details?:
    | (NonNullable<MolliePayment["details"]> & {
        failureReason?: string | null;
        bankReason?: string | null;
      })
    | null;
};

interface MollieMandate {
  id: string; // mdt_…
  method: string; // creditcard, directdebit, paypal
  status: "valid" | "pending" | "invalid";
  createdAt?: string;
  details?: {
    cardLabel?: string | null;
    cardNumber?: string | null;
    consumerAccount?: string | null;
  } | null;
}

/** Page de paiement Mollie encore valable : reprise plutôt que doublée (une carte a 15 minutes chez Mollie). */
const OPEN_REUSE_MS = 15 * 60_000;
/** Réponse de Mollie perdue : le paiement est cherché chez Mollie avant d'en créer un autre. */
const STUCK_MS = 5 * 60_000;
const DAY = 86_400_000;

/** Prestataire de l'offre Pro : Mollie dès que la clé d'Evoly est configurée, Stripe avant (jusqu'au lot 7). */
export function proBillingProvider(): "MOLLIE" | "STRIPE" | null {
  if (evolyMollie()) return "MOLLIE";
  return stripe() ? "STRIPE" : null;
}

/** Prix de Pro dans une devise (conditions tarifaires), mensuel et annuel. */
export async function proPrices(currency: string) {
  const t = await db.planCurrencyTerms.findUnique({
    where: { planId_currency: { planId: "pro", currency } },
    select: { monthlyPriceMinor: true, yearlyPriceMinor: true },
  });
  return {
    MONTH: t?.monthlyPriceMinor ?? 2900,
    YEAR: t?.yearlyPriceMinor ?? 29580,
  };
}

/** Webhook des paiements Pro (compte d'Evoly) ; aucun en local, où le retour sur la page Abonnement suffit. */
const proWebhookUrl = () => mollieWebhookUrl("/api/webhooks/mollie/pro");

function requireMollie(): MollieApi {
  const api = evolyMollie();
  if (!api) throw new CoreError("BILLING_UNAVAILABLE");
  return api;
}

/** Moyen de paiement affiché : marque et 4 derniers chiffres de la carte, ou début et fin de l'IBAN. */
export function mandateLabel(m: MollieMandate): string | null {
  const d = m.details ?? {};
  if (m.method === "creditcard") {
    const last4 = (d.cardNumber ?? "").replace(/\D/g, "").slice(-4);
    if (!last4) return d.cardLabel ?? null;
    return [d.cardLabel, `•••• ${last4}`].filter(Boolean).join(" ");
  }
  if (m.method === "directdebit" && d.consumerAccount) {
    const iban = d.consumerAccount.replace(/\s/g, "");
    return `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
  }
  if (m.method === "paypal") return "PayPal";
  return null;
}

/**
 * Paiement en cours pour l'abonnement : prélèvement en traitement chez Mollie (prélèvement SEPA : quelques jours) ; avec
 * `checkout`, aussi une page de paiement ouverte il y a peu (l'organisateur est peut-être en train de payer).
 */
async function paymentInProgress(
  subscriptionId: string,
  now: Date,
  opts: { checkout?: boolean } = {},
) {
  return !!(await db.subscriptionPayment.findFirst({
    where: {
      subscriptionId,
      OR: [
        { status: "PENDING" },
        ...(opts.checkout
          ? [
              {
                status: "OPEN" as const,
                createdAt: { gt: new Date(now.getTime() - OPEN_REUSE_MS) },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  }));
}

/** RG-SUB-02 : essai de 14 jours sans carte, une fois par organisation ; sans abonnement à sa fin, retour en Free. */
export async function startProTrial(
  ctx: OrgContext,
  interval: BillingInterval,
  now = new Date(),
) {
  if (proBillingProvider() !== "MOLLIE")
    throw new CoreError("BILLING_UNAVAILABLE");
  const organizationId = ctx.organization.id;
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  if (sub && effectivePlan(sub, now) !== "free")
    throw new CoreError("ALREADY_SUBSCRIBED");
  const days =
    (await db.plan.findUnique({ where: { id: "pro" } }))?.trialDays ?? 14;
  if (!trialEligible(sub) || days <= 0)
    throw new CoreError("TRIAL_ALREADY_USED");
  const end = new Date(now.getTime() + days * DAY);
  const data = {
    planId: "pro",
    status: "TRIALING" as const,
    interval,
    nextInterval: null,
    trialEndsAt: end,
    currentPeriodStart: now,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    pastDueSince: null,
    stripeSubscriptionId: null,
  };
  const saved = await db.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      currency: ctx.organization.currency,
      ...data,
    },
    update: data,
  });
  await audit({
    action: "billing.trial_started",
    organizationId,
    actorUserId: ctx.user.id,
    targetType: "Subscription",
    targetId: saved.id,
    metadata: { days, provider: "MOLLIE" },
  });
  await notifyOwner(organizationId, "STARTED");
}

/** Client Mollie de l'organisation sur le compte d'Evoly, créé au premier paiement. */
async function ensureCustomer(
  api: MollieApi,
  organizationId: string,
): Promise<Subscription> {
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  if (sub?.mollieCustomerId) return sub;
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });
  const who = await subscriptionOwner(organizationId);
  const customer = await api<{ id: string }>("/customers", {
    body: {
      name: (org.legalName ?? org.name).slice(0, 255),
      ...(who?.email ? { email: who.email } : {}),
      locale: mollieLocale(org.locale, org.country),
      metadata: { organizationId },
    },
    idempotencyKey: `pro-customer:${organizationId}`,
  });
  return db.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      currency: org.currency,
      mollieCustomerId: customer.id,
    },
    update: { mollieCustomerId: customer.id },
  });
}

/**
 * Page de paiement Mollie (premier paiement, règlement d'une période impayée, ou carte enregistrée à 0 €) : celle encore
 * ouverte est reprise, sinon un paiement est créé. Rend l'adresse vers laquelle envoyer l'organisateur.
 */
async function openCheckout(input: {
  ctx: OrgContext;
  kind: "FIRST" | "SETTLE" | "MANDATE";
  interval: BillingInterval | null;
  amountMinor: number;
  period: { start: Date; end: Date } | null;
  now: Date;
}): Promise<string> {
  const { ctx, kind, now } = input;
  const api = requireMollie();
  let sub: Subscription;
  try {
    sub = await ensureCustomer(api, ctx.organization.id);
  } catch (err) {
    console.error("client Mollie de l'offre Pro", safeError(err));
    throw new CoreError("MOLLIE_UNAVAILABLE");
  }
  const back = (rowId: string) =>
    `${billingUrl(ctx.organization.slug)}?mollie=${rowId}`;
  const reusable = await db.subscriptionPayment.findFirst({
    where: {
      subscriptionId: sub.id,
      kind,
      status: "OPEN",
      interval: input.interval,
      amountMinor: input.amountMinor,
      molliePaymentId: { not: null },
      createdAt: { gt: new Date(now.getTime() - OPEN_REUSE_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (reusable) {
    const p = await api<ProPayment>(
      `/payments/${reusable.molliePaymentId}`,
    ).catch(() => null);
    if (p?.status === "open" && p._links.checkout?.href)
      return p._links.checkout.href;
    if (p) {
      const status = await applyProPayment(reusable, p, now);
      if (status === "PAID" || status === "PENDING") return back(reusable.id);
    }
  }
  const org = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organization.id },
    select: { name: true, locale: true, country: true, currency: true },
  });
  const row = await db.subscriptionPayment.create({
    data: {
      organizationId: ctx.organization.id,
      subscriptionId: sub.id,
      kind,
      interval: input.interval,
      amountMinor: input.amountMinor,
      currency: sub.currency,
      periodStart: input.period?.start ?? null,
      periodEnd: input.period?.end ?? null,
    },
  });
  try {
    const p = await api<ProPayment>("/payments", {
      body: {
        amount: toMollieAmount(input.amountMinor, sub.currency),
        description: `Evoly Pro ${org.name}`.slice(0, 100),
        redirectUrl: back(row.id),
        webhookUrl: proWebhookUrl(),
        locale: mollieLocale(org.locale, org.country),
        metadata: {
          organizationId: ctx.organization.id,
          subscriptionPaymentId: row.id,
          kind,
        },
        sequenceType: "first",
        customerId: sub.mollieCustomerId,
        // carte enregistrée sans paiement : Mollie n'accepte 0 € que pour une carte
        ...(kind === "MANDATE" ? { method: "creditcard" } : {}),
      },
      idempotencyKey: `pro-payment:${row.id}`,
    });
    const url = p._links.checkout?.href ?? null;
    const saved = await db.subscriptionPayment.update({
      where: { id: row.id },
      data: { molliePaymentId: p.id, checkoutUrl: url },
    });
    if (url) return url;
    await applyProPayment(saved, p, now);
    return back(row.id);
  } catch (err) {
    await db.subscriptionPayment.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        failedAt: now,
        failureReason: (err instanceof MollieError
          ? err.message
          : "Mollie injoignable"
        ).slice(0, 300),
      },
    });
    console.error("paiement Pro Mollie", safeError(err));
    throw new CoreError("MOLLIE_UNAVAILABLE");
  }
}

/**
 * S'abonner à Pro (ou régler une période impayée) : paiement sur la page de Mollie, qui crée le mandat des
 * renouvellements. La première période commence à la fin de ce qui court encore (essai, Pro offert, ancien abonnement
 * Stripe), calculée au paiement.
 */
export async function startProCheckout(
  ctx: OrgContext,
  interval: BillingInterval,
  now = new Date(),
): Promise<string> {
  requireMollie();
  const sub = await db.subscription.findUnique({
    where: { organizationId: ctx.organization.id },
  });
  const plan = sub ? effectivePlan(sub, now) : "free";
  if (plan === "partner") throw new CoreError("ALREADY_SUBSCRIBED");
  const prices = await proPrices(sub?.currency ?? ctx.organization.currency);
  if (sub && renewsWithMollie(sub)) {
    if (sub.status !== "PAST_DUE") throw new CoreError("ALREADY_SUBSCRIBED");
    // période impayée : réglée avec un nouveau moyen de paiement, sans attendre la prochaine tentative
    if (await paymentInProgress(sub.id, now))
      throw new CoreError("PAYMENT_PENDING");
    const due = sub.interval ?? interval;
    return openCheckout({
      ctx,
      kind: "SETTLE",
      interval: due,
      amountMinor: prices[due],
      period:
        sub.currentPeriodStart && sub.currentPeriodEnd
          ? { start: sub.currentPeriodStart, end: sub.currentPeriodEnd }
          : null,
      now,
    });
  }
  // résilié mais encore en cours : il se reprend sans payer ; Pro offert sans fin : rien à payer
  if (
    sub?.billingProvider === "MOLLIE" &&
    sub.status === "ACTIVE" &&
    sub.cancelAtPeriodEnd &&
    plan === "pro"
  )
    throw new CoreError("ALREADY_SUBSCRIBED");
  if (
    sub &&
    plan === "pro" &&
    sub.status === "ACTIVE" &&
    !sub.currentPeriodEnd &&
    !sub.stripeSubscriptionId
  )
    throw new CoreError("ALREADY_SUBSCRIBED");
  const start = firstPeriodStart(sub, now);
  const url = await openCheckout({
    ctx,
    kind: "FIRST",
    interval,
    amountMinor: prices[interval],
    period: { start, end: addBillingInterval(start, interval) },
    now,
  });
  await audit({
    action: "billing.checkout_started",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Subscription",
    targetId: ctx.organization.id,
    metadata: { interval, provider: "MOLLIE" },
  });
  return url;
}

/** Changer de moyen de paiement : carte enregistrée sur la page de Mollie, sans paiement (0 €), pour les prochains prélèvements. */
export async function startPaymentMethodChange(
  ctx: OrgContext,
  now = new Date(),
): Promise<string> {
  requireMollie();
  const sub = await db.subscription.findUnique({
    where: { organizationId: ctx.organization.id },
  });
  if (!sub || !renewsWithMollie(sub)) throw new CoreError("NOT_SUBSCRIBED");
  return openCheckout({
    ctx,
    kind: "MANDATE",
    interval: null,
    amountMinor: 0,
    period: null,
    now,
  });
}

/** Résiliation : plus aucun prélèvement ; Pro jusqu'à la fin de la période payée, puis Free (rien n'est supprimé). */
export async function cancelProSubscription(ctx: OrgContext, now = new Date()) {
  const sub = await db.subscription.findUnique({
    where: { organizationId: ctx.organization.id },
  });
  if (!sub || !renewsWithMollie(sub) || sub.status !== "ACTIVE")
    throw new CoreError("NOT_SUBSCRIBED");
  await db.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: true, canceledAt: now, nextInterval: null },
  });
  await audit({
    action: "billing.canceled",
    organizationId: sub.organizationId,
    actorUserId: ctx.user.id,
    targetType: "Subscription",
    targetId: sub.id,
    metadata: { until: sub.currentPeriodEnd?.toISOString() ?? null },
  });
}

/** Reprise d'un abonnement résilié avant la fin de sa période : les renouvellements reprennent, sans paiement. */
export async function resumeProSubscription(ctx: OrgContext, now = new Date()) {
  const sub = await db.subscription.findUnique({
    where: { organizationId: ctx.organization.id },
  });
  if (
    !sub ||
    sub.billingProvider !== "MOLLIE" ||
    !sub.mollieMandateId ||
    sub.status !== "ACTIVE" ||
    !sub.cancelAtPeriodEnd ||
    !sub.currentPeriodEnd ||
    sub.currentPeriodEnd <= now
  )
    throw new CoreError("NOT_SUBSCRIBED");
  await db.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: false, canceledAt: null },
  });
  await audit({
    action: "billing.resumed",
    organizationId: sub.organizationId,
    actorUserId: ctx.user.id,
    targetType: "Subscription",
    targetId: sub.id,
  });
}

/** RG-SUB-05 : mensuel ou annuel au prochain renouvellement, sans prorata ; revenir au choix en cours l'annule. */
export async function scheduleIntervalSwitch(
  ctx: OrgContext,
  interval: BillingInterval,
) {
  const sub = await db.subscription.findUnique({
    where: { organizationId: ctx.organization.id },
  });
  if (!sub || !renewsWithMollie(sub) || sub.status !== "ACTIVE")
    throw new CoreError("NOT_SUBSCRIBED");
  await db.subscription.update({
    where: { id: sub.id },
    data: { nextInterval: interval === sub.interval ? null : interval },
  });
  await audit({
    action: "billing.interval_scheduled",
    organizationId: sub.organizationId,
    actorUserId: ctx.user.id,
    targetType: "Subscription",
    targetId: sub.id,
    metadata: { interval },
  });
}

const STATUS: Record<MolliePayment["status"], SubscriptionPayment["status"]> = {
  open: "OPEN",
  pending: "PENDING",
  authorized: "PENDING",
  paid: "PAID",
  canceled: "FAILED",
  expired: "FAILED",
  failed: "FAILED",
};

/**
 * État d'un paiement Pro selon Mollie, appliqué une seule fois : le passage du paiement et ses effets sur l'abonnement
 * sont écrits ensemble (transaction), les e-mails et la facture partent ensuite. Payé, l'abonnement avance ; échoué, un
 * renouvellement met l'abonnement en impayé ; contesté, la période redevient due.
 */
export async function applyProPayment(
  row: SubscriptionPayment,
  p: ProPayment,
  now = new Date(),
): Promise<SubscriptionPayment["status"]> {
  const chargedBack =
    !!p.amountChargedBack && fromMollieAmount(p.amountChargedBack) > 0;
  const next: SubscriptionPayment["status"] =
    row.status === "PAID" && chargedBack ? "CHARGED_BACK" : STATUS[p.status];
  if (next === row.status) return row.status;
  // états définitifs : un paiement échoué ou contesté ne change plus ; payé, il ne peut plus qu'être contesté
  if (row.status === "FAILED" || row.status === "CHARGED_BACK")
    return row.status;
  if (row.status === "PAID" && next !== "CHARGED_BACK") return row.status;
  if (
    next === "PAID" &&
    (fromMollieAmount(p.amount) !== row.amountMinor ||
      p.amount.currency !== row.currency)
  ) {
    console.error("paiement Pro : montant inattendu", row.id, p.id);
    return row.status;
  }
  // mandat lu chez Mollie avant la transaction (appel externe)
  const sub0 = await db.subscription.findUniqueOrThrow({
    where: { id: row.subscriptionId },
  });
  const mandate =
    next === "PAID" && row.kind !== "RENEWAL" && sub0.mollieCustomerId
      ? await mandateOf(
          requireMollie(),
          p.customerId ?? sub0.mollieCustomerId,
          p,
        )
      : null;
  const after = await db.$transaction(async (tx) => {
    const claimed = await tx.subscriptionPayment.updateMany({
      where: { id: row.id, status: row.status },
      data: {
        status: next,
        method: p.method ?? row.method,
        ...(next === "PAID"
          ? { paidAt: p.paidAt ? new Date(p.paidAt) : now }
          : {}),
        ...(next === "FAILED"
          ? {
              failedAt: now,
              failureReason: (
                p.details?.failureReason ??
                p.details?.bankReason ??
                p.status
              ).slice(0, 300),
            }
          : {}),
      },
    });
    if (claimed.count === 0) return null;
    const sub = await tx.subscription.findUniqueOrThrow({
      where: { id: row.subscriptionId },
    });
    if (next === "PAID") return paidChanges(tx, row, sub, mandate, now);
    if (next === "FAILED") return failedChanges(tx, row, sub, now);
    if (next === "CHARGED_BACK") return chargedBackChanges(tx, row, sub, now);
    return async () => undefined;
  });
  if (!after)
    return (
      await db.subscriptionPayment.findUniqueOrThrow({ where: { id: row.id } })
    ).status;
  await after();
  return next;
}

/** Mandat créé par un premier paiement, et son libellé ; à défaut d'identifiant, le plus récent du client. */
async function mandateOf(
  api: MollieApi,
  customerId: string,
  p: ProPayment,
): Promise<{ id: string; label: string | null } | null> {
  try {
    if (p.mandateId) {
      const m = await api<MollieMandate>(
        `/customers/${customerId}/mandates/${p.mandateId}`,
      );
      return { id: m.id, label: mandateLabel(m) };
    }
    const list = await api<MollieList<"mandates", MollieMandate>>(
      `/customers/${customerId}/mandates`,
      { query: { limit: 5 } },
    );
    const m = (list._embedded?.mandates ?? []).find(
      (x) => x.status !== "invalid",
    );
    return m ? { id: m.id, label: mandateLabel(m) } : null;
  } catch (err) {
    console.error("mandat Mollie", customerId, safeError(err));
    return p.mandateId ? { id: p.mandateId, label: null } : null;
  }
}

/**
 * Ancien abonnement Stripe d'une organisation passée à Mollie : arrêté à la fin de sa période payée (ou de son essai),
 * sans nouveau prélèvement ; impayé chez Stripe, arrêté tout de suite, pour que Stripe ne relance plus la facture.
 */
async function endStripeSubscription(
  id: string,
  organizationId: string,
  now: boolean,
) {
  const s = stripe();
  if (!s) return;
  await (
    now
      ? s.subscriptions.cancel(id)
      : s.subscriptions.update(id, { cancel_at_period_end: true })
  ).catch((err) =>
    console.error(
      "abonnement Stripe à arrêter",
      organizationId,
      safeError(err),
    ),
  );
}

type Tx = Prisma.TransactionClient;
type AfterCommit = () => Promise<void>;

/** Paiement reçu : effets sur l'abonnement (dans la transaction), puis audit, e-mails et facture. */
async function paidChanges(
  tx: Tx,
  row: SubscriptionPayment,
  sub: Subscription,
  mandate: { id: string; label: string | null } | null,
  now: Date,
): Promise<AfterCommit> {
  const before = effectivePlan(sub, now);
  const mandateData = mandate
    ? { mollieMandateId: mandate.id, paymentMethodLabel: mandate.label }
    : {};
  let paid = row;
  let movedFromStripe: string | null = null;
  const stripeUnpaid = ["PAST_DUE", "UNPAID", "INCOMPLETE"].includes(
    sub.status,
  );
  if (row.kind === "MANDATE") {
    await tx.subscription.update({ where: { id: sub.id }, data: mandateData });
  } else if (row.kind === "RENEWAL") {
    if (
      sub.status === "PAST_DUE" &&
      sub.currentPeriodStart?.getTime() === row.periodStart?.getTime()
    )
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "ACTIVE", pastDueSince: null },
      });
  } else if (
    row.kind === "SETTLE" &&
    sub.status === "PAST_DUE" &&
    sub.billingProvider === "MOLLIE"
  ) {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: "ACTIVE", pastDueSince: null, ...mandateData },
    });
  } else {
    // premier paiement (ou règlement arrivé quand plus rien n'était dû) : une période payée de plus, après ce qui court
    const interval = row.interval ?? sub.interval ?? "MONTH";
    const start = firstPeriodStart(sub, now);
    const end = addBillingInterval(start, interval);
    paid = await tx.subscriptionPayment.update({
      where: { id: row.id },
      data: { periodStart: start, periodEnd: end },
    });
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        planId: "pro",
        status: "ACTIVE",
        interval,
        nextInterval: null,
        billingProvider: "MOLLIE",
        ...mandateData,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        pastDueSince: null,
        stripeSubscriptionId: null,
        renewalNoticeFor: null,
      },
    });
    movedFromStripe = sub.stripeSubscriptionId;
  }
  const saved = await tx.subscription.findUniqueOrThrow({
    where: { id: sub.id },
  });
  const upgraded = before !== "pro" && effectivePlan(saved, now) === "pro";
  return async () => {
    if (movedFromStripe) {
      await endStripeSubscription(
        movedFromStripe,
        sub.organizationId,
        stripeUnpaid,
      );
      await audit({
        action: "billing.moved_to_mollie",
        organizationId: sub.organizationId,
        actorType: "SYSTEM",
        targetType: "Subscription",
        targetId: sub.id,
        metadata: { stripeSubscriptionId: movedFromStripe },
      });
    }
    await audit({
      action: "billing.payment_paid",
      organizationId: sub.organizationId,
      actorType: "SYSTEM",
      targetType: "SubscriptionPayment",
      targetId: row.id,
      metadata: { kind: row.kind, amountMinor: row.amountMinor },
    });
    if (upgraded) {
      await audit({
        action: "billing.upgraded",
        organizationId: sub.organizationId,
        actorType: "SYSTEM",
        targetType: "Subscription",
        targetId: sub.id,
        metadata: { provider: "MOLLIE" },
      });
      await notifyOwner(sub.organizationId, "STARTED");
    }
    if (paid.amountMinor > 0) await issueInvoiceFor(paid.id, now);
  };
}

/** Facture d'un paiement reçu, avec le prochain prélèvement annoncé s'il y en a un. */
async function issueInvoiceFor(paymentId: string, now: Date) {
  const payment = await db.subscriptionPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { subscription: true },
  });
  const sub = payment.subscription;
  const nextInterval = sub.nextInterval ?? sub.interval ?? "MONTH";
  await issueProInvoice(
    paymentId,
    renewsWithMollie(sub) && sub.currentPeriodEnd
      ? {
          date: sub.currentPeriodEnd,
          amountMinor: (await proPrices(sub.currency))[nextInterval],
          method: sub.paymentMethodLabel,
        }
      : null,
    now,
  );
}

/** Prélèvement échoué : la période en cours devient impayée (7 jours avant le retour en Free), le propriétaire est prévenu. */
async function failedChanges(
  tx: Tx,
  row: SubscriptionPayment,
  sub: Subscription,
  now: Date,
): Promise<AfterCommit> {
  // premier paiement ou carte : l'organisateur voit l'échec en revenant de Mollie, rien ne change
  if (
    row.kind !== "RENEWAL" ||
    sub.billingProvider !== "MOLLIE" ||
    sub.currentPeriodStart?.getTime() !== row.periodStart?.getTime() ||
    (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE")
  )
    return async () => undefined;
  await tx.subscription.update({
    where: { id: sub.id },
    data: { status: "PAST_DUE", pastDueSince: sub.pastDueSince ?? now },
  });
  return async () => {
    await audit({
      action: "billing.payment_failed",
      organizationId: sub.organizationId,
      actorType: "SYSTEM",
      targetType: "SubscriptionPayment",
      targetId: row.id,
      metadata: { attempt: row.attempt },
    });
    await paymentFailedNotice(sub.organizationId); // RG-SUB-06 : à chaque échec
  };
}

async function paymentFailedNotice(organizationId: string) {
  await notifyOwner(organizationId, "PAYMENT_FAILED");
  await notify(
    organizationId,
    "SUBSCRIPTION_PAYMENT_FAILED",
    {
      title: "Paiement de l'abonnement",
      body: "Le paiement de l'abonnement Pro a échoué : réglez-le ou changez de moyen de paiement.",
      link: "/billing",
    },
    { email: false },
  );
}

/** Paiement contesté auprès de la banque : la période qu'il couvrait redevient due, avec les 7 jours avant le retour en Free. */
async function chargedBackChanges(
  tx: Tx,
  row: SubscriptionPayment,
  sub: Subscription,
  now: Date,
): Promise<AfterCommit> {
  const due =
    row.kind !== "MANDATE" &&
    sub.billingProvider === "MOLLIE" &&
    sub.status === "ACTIVE" &&
    !!row.periodEnd &&
    row.periodEnd > now;
  if (due)
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: "PAST_DUE", pastDueSince: now },
    });
  return async () => {
    await audit({
      action: "billing.payment_charged_back",
      organizationId: sub.organizationId,
      actorType: "SYSTEM",
      targetType: "SubscriptionPayment",
      targetId: row.id,
    });
    if (due) await paymentFailedNotice(sub.organizationId);
  };
}

/** Prélèvement refusé d'emblée par Mollie (mandat révoqué…) : échec, appliqué comme un échec signalé par Mollie. */
async function failRenewal(
  row: SubscriptionPayment,
  reason: string,
  now: Date,
) {
  const after = await db.$transaction(async (tx) => {
    const claimed = await tx.subscriptionPayment.updateMany({
      where: { id: row.id, status: "OPEN" },
      data: {
        status: "FAILED",
        failedAt: now,
        failureReason: reason.slice(0, 300),
      },
    });
    if (claimed.count === 0) return null;
    const sub = await tx.subscription.findUniqueOrThrow({
      where: { id: row.subscriptionId },
    });
    return failedChanges(tx, row, sub, now);
  });
  if (after) await after();
}

/** Relit un paiement Pro chez Mollie et applique son état (webhook, retour sur la page Abonnement, tâche horaire). */
export async function syncProPayment(
  rowId: string,
  now = new Date(),
): Promise<SubscriptionPayment | null> {
  const api = evolyMollie();
  const row = await db.subscriptionPayment.findUnique({ where: { id: rowId } });
  if (!api || !row?.molliePaymentId) return row;
  const p = await api<ProPayment>(`/payments/${row.molliePaymentId}`);
  await applyProPayment(row, p, now);
  return db.subscriptionPayment.findUnique({ where: { id: rowId } });
}

/** Retour de Mollie sur la page Abonnement : le paiement de cette organisation, relu. */
export async function proPaymentReturn(ctx: OrgContext, rowId: string) {
  const row = await db.subscriptionPayment.findFirst({
    where: { id: rowId, organizationId: ctx.organization.id },
  });
  if (!row) return null;
  try {
    return await syncProPayment(row.id);
  } catch (err) {
    console.error("retour de paiement Pro", safeError(err));
    return row;
  }
}

/** Webhook Mollie des paiements Pro : l'identifiant seul, état relu chez Mollie (compte d'Evoly). */
export async function handleProWebhook(id: string, now = new Date()) {
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return;
  const known = await db.subscriptionPayment.findUnique({
    where: { molliePaymentId: id },
  });
  if (known) {
    await syncProPayment(known.id, now);
    return;
  }
  // paiement créé à l'instant, dont Evoly n'a pas encore noté l'identifiant : retrouvé par ses métadonnées
  const api = evolyMollie();
  if (!api) return;
  const p = await api<ProPayment>(`/payments/${id}`).catch((err) => {
    // paiement inconnu du compte d'Evoly : rien à faire, Mollie n'a pas à relancer
    if (err instanceof MollieError && err.status === 404) return null;
    throw err;
  });
  if (!p) return;
  const rowId = p.metadata?.subscriptionPaymentId;
  if (typeof rowId !== "string") return;
  const row = await db.subscriptionPayment.findUnique({ where: { id: rowId } });
  if (!row || (row.molliePaymentId && row.molliePaymentId !== id)) return;
  const saved = row.molliePaymentId
    ? row
    : await db.subscriptionPayment.update({
        where: { id: row.id },
        data: { molliePaymentId: id },
      });
  await applyProPayment(saved, p, now);
}

/** Prélèvement d'un renouvellement sur le mandat (sans le client) ; Mollie refuse : échec du paiement. */
async function chargeRenewal(
  api: MollieApi,
  sub: Subscription,
  row: SubscriptionPayment,
  orgName: string,
  now: Date,
) {
  if (sub.billingProvider !== "MOLLIE" || !sub.mollieMandateId) {
    await db.subscriptionPayment.updateMany({
      where: { id: row.id, status: "OPEN" },
      data: {
        status: "FAILED",
        failedAt: now,
        failureReason: "abonnement arrêté",
      },
    });
    return;
  }
  try {
    const p = await api<ProPayment>("/payments", {
      body: {
        amount: toMollieAmount(row.amountMinor, row.currency),
        description: `Evoly Pro ${orgName}`.slice(0, 100),
        customerId: sub.mollieCustomerId,
        mandateId: sub.mollieMandateId,
        sequenceType: "recurring",
        webhookUrl: proWebhookUrl(),
        metadata: {
          organizationId: sub.organizationId,
          subscriptionPaymentId: row.id,
          kind: "RENEWAL",
        },
      },
      idempotencyKey: `pro-payment:${row.id}`,
    });
    const saved = await db.subscriptionPayment.update({
      where: { id: row.id },
      data: { molliePaymentId: p.id },
    });
    await applyProPayment(saved, p, now);
  } catch (err) {
    if (err instanceof MollieError && err.status >= 400 && err.status < 500)
      // mandat révoqué ou invalide, moyen refusé… : échec du prélèvement
      await failRenewal(row, err.message, now);
    else console.error("prélèvement Pro", sub.organizationId, safeError(err)); // repris à la prochaine heure
  }
}

/** Nouvelle ligne de prélèvement : jamais deux fois la même tentative d'une même période (clé unique). */
async function renewalRow(
  sub: Subscription,
  data: {
    interval: BillingInterval;
    amountMinor: number;
    start: Date;
    end: Date;
    attempt: number;
  },
) {
  try {
    return await db.subscriptionPayment.create({
      data: {
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        kind: "RENEWAL",
        interval: data.interval,
        amountMinor: data.amountMinor,
        currency: sub.currency,
        periodStart: data.start,
        periodEnd: data.end,
        attempt: data.attempt,
        renewalKey: `${sub.id}:${data.start.toISOString()}:${data.attempt}`,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    )
      return null;
    throw err;
  }
}

const orgNameOf = async (organizationId: string) =>
  (
    await db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    })
  ).name;

/** Renouvellement d'une période : la suivante commence à l'échéance, au mensuel ou à l'annuel choisi, puis le prélèvement. */
async function renew(api: MollieApi, sub: Subscription, now: Date) {
  const start = sub.currentPeriodEnd!;
  const interval = sub.nextInterval ?? sub.interval ?? "MONTH";
  const end = addBillingInterval(start, interval);
  const prices = await proPrices(sub.currency);
  const row = await db.$transaction(async (tx) => {
    const moved = await tx.subscription.updateMany({
      where: {
        id: sub.id,
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: start,
      },
      data: {
        currentPeriodStart: start,
        currentPeriodEnd: end,
        interval,
        nextInterval: null,
      },
    });
    if (moved.count === 0) return null;
    return tx.subscriptionPayment.create({
      data: {
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        kind: "RENEWAL",
        interval,
        amountMinor: prices[interval],
        currency: sub.currency,
        periodStart: start,
        periodEnd: end,
        renewalKey: `${sub.id}:${start.toISOString()}:1`,
      },
    });
  });
  if (!row) return false;
  await chargeRenewal(
    api,
    { ...sub, interval, currentPeriodStart: start, currentPeriodEnd: end },
    row,
    await orgNameOf(sub.organizationId),
    now,
  );
  return true;
}

/** Prélèvements créés sans réponse de Mollie : retrouvés chez Mollie par leurs métadonnées, sinon prélevés de nouveau. */
async function recoverStuckRenewals(api: MollieApi, now: Date) {
  const stuck = await db.subscriptionPayment.findMany({
    where: {
      kind: "RENEWAL",
      status: "OPEN",
      molliePaymentId: null,
      createdAt: { lt: new Date(now.getTime() - STUCK_MS) },
    },
    include: { subscription: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let n = 0;
  for (const row of stuck) {
    try {
      const customer = row.subscription.mollieCustomerId;
      const list = customer
        ? await api<MollieList<"payments", ProPayment>>(
            `/customers/${customer}/payments`,
            { query: { limit: 10 } },
          )
        : null;
      const found = (list?._embedded?.payments ?? []).find(
        (p) => p.metadata?.subscriptionPaymentId === row.id,
      );
      if (found) {
        const saved = await db.subscriptionPayment.update({
          where: { id: row.id },
          data: { molliePaymentId: found.id },
        });
        await applyProPayment(saved, found, now);
      } else
        await chargeRenewal(
          api,
          row.subscription,
          row,
          await orgNameOf(row.organizationId),
          now,
        );
      n += 1;
    } catch (err) {
      console.error("prélèvement Pro à reprendre", row.id, safeError(err));
    }
  }
  return n;
}

/**
 * Tâche horaire de l'offre Pro payée par Mollie : renouvellements dus (au plus tôt un jour avant l'échéance), nouvelles
 * tentatives d'une période impayée (3 jours après un échec, 3 en tout), fin des abonnements impayés au-delà de 7 jours
 * ou résiliés à leur échéance, rappel avant un renouvellement annuel ou un changement de périodicité.
 */
export async function runProBilling(now = new Date()) {
  const out = { renewed: 0, retried: 0, recovered: 0, ended: 0, notices: 0 };
  const api = evolyMollie();
  if (!api) return out;
  out.recovered = await recoverStuckRenewals(api, now);

  // paiement reçu sans facture (envoi interrompu) : émise maintenant, une seule fois
  const unbilled = await db.subscriptionPayment.findMany({
    where: {
      status: "PAID",
      amountMinor: { gt: 0 },
      invoice: null,
      paidAt: { gt: new Date(now.getTime() - 60 * DAY) },
      updatedAt: { lt: new Date(now.getTime() - STUCK_MS) },
    },
    select: { id: true },
    take: 50,
  });
  for (const u of unbilled)
    await issueInvoiceFor(u.id, now).catch((err) =>
      console.error("facture Pro à émettre", u.id, safeError(err)),
    );

  const due = await db.subscription.findMany({
    where: {
      billingProvider: "MOLLIE",
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      mollieMandateId: { not: null },
      mollieCustomerId: { not: null },
      currentPeriodEnd: { lte: new Date(now.getTime() + RENEWAL_LEAD_MS) },
    },
    orderBy: { currentPeriodEnd: "asc" },
    take: 200,
  });
  for (const sub of due) {
    try {
      if (await renew(api, sub, now)) out.renewed += 1;
    } catch (err) {
      console.error("renouvellement Pro", sub.organizationId, safeError(err));
    }
  }

  const grace = PAST_DUE_GRACE_DAYS * DAY;
  const late = await db.subscription.findMany({
    where: {
      billingProvider: "MOLLIE",
      status: "PAST_DUE",
      cancelAtPeriodEnd: false,
      mollieMandateId: { not: null },
      pastDueSince: { gt: new Date(now.getTime() - grace) },
    },
    take: 200,
  });
  for (const sub of late) {
    try {
      const last = await db.subscriptionPayment.findFirst({
        where: {
          subscriptionId: sub.id,
          kind: "RENEWAL",
          periodStart: sub.currentPeriodStart,
        },
        orderBy: { attempt: "desc" },
      });
      const at =
        last?.status === "FAILED" && last.failedAt
          ? nextRenewalAttempt(last.failedAt, last.attempt)
          : null;
      if (
        !last ||
        !at ||
        at > now ||
        (await paymentInProgress(sub.id, now, { checkout: true }))
      )
        continue;
      const row = await renewalRow(sub, {
        interval: last.interval ?? sub.interval ?? "MONTH",
        amountMinor: last.amountMinor,
        start: last.periodStart!,
        end: last.periodEnd!,
        attempt: last.attempt + 1,
      });
      if (!row) continue;
      await chargeRenewal(
        api,
        sub,
        row,
        await orgNameOf(sub.organizationId),
        now,
      );
      out.retried += 1;
    } catch (err) {
      console.error("relance Pro", sub.organizationId, safeError(err));
    }
  }

  // impayé depuis 7 jours, sans prélèvement en cours : fin, au terme du délai (l'e-mail part avec les autres retours en Free)
  const unpaid = await db.subscription.findMany({
    where: {
      billingProvider: "MOLLIE",
      status: "PAST_DUE",
      pastDueSince: { lte: new Date(now.getTime() - grace) },
    },
    take: 200,
  });
  for (const sub of unpaid) {
    if (await paymentInProgress(sub.id, now, { checkout: true })) continue;
    const ended = await db.subscription.updateMany({
      where: { id: sub.id, status: "PAST_DUE" },
      data: {
        status: "CANCELED",
        canceledAt: now,
        currentPeriodEnd: new Date(sub.pastDueSince!.getTime() + grace),
      },
    });
    if (ended.count > 0) {
      out.ended += 1;
      await audit({
        action: "billing.ended_unpaid",
        organizationId: sub.organizationId,
        actorType: "SYSTEM",
        targetType: "Subscription",
        targetId: sub.id,
      });
    }
  }

  // résilié : terminé à l'échéance
  const closing = await db.subscription.updateMany({
    where: {
      billingProvider: "MOLLIE",
      status: "ACTIVE",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { lte: now },
    },
    data: { status: "CANCELED" },
  });
  out.ended += closing.count;

  // préavis du prélèvement : 7 jours avant un renouvellement annuel ou un changement de périodicité (le mensuel est
  // annoncé par la facture précédente)
  const soon = await db.subscription.findMany({
    where: {
      billingProvider: "MOLLIE",
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      mollieMandateId: { not: null },
      currentPeriodEnd: {
        gt: new Date(now.getTime() + RENEWAL_LEAD_MS),
        lte: new Date(now.getTime() + 7 * DAY),
      },
      OR: [{ interval: "YEAR" }, { nextInterval: { not: null } }],
    },
    take: 200,
  });
  for (const sub of soon) {
    if (sub.renewalNoticeFor?.getTime() === sub.currentPeriodEnd!.getTime())
      continue;
    const claimed = await db.subscription.updateMany({
      where: {
        id: sub.id,
        currentPeriodEnd: sub.currentPeriodEnd,
        OR: [
          { renewalNoticeFor: null },
          { renewalNoticeFor: { not: sub.currentPeriodEnd! } },
        ],
      },
      data: { renewalNoticeFor: sub.currentPeriodEnd },
    });
    if (claimed.count === 0) continue;
    const interval = sub.nextInterval ?? sub.interval ?? "MONTH";
    const amount = (await proPrices(sub.currency))[interval];
    await notifyOwner(sub.organizationId, "RENEWAL_NOTICE", {
      vars: ({ locale, timezone }) => ({
        nextDate: formatDate(sub.currentPeriodEnd!, timezone, locale),
        nextAmount: formatMoney(amount, sub.currency, locale),
        method: sub.paymentMethodLabel,
      }),
    });
    out.notices += 1;
  }
  return out;
}

/** Paiements et factures de l'organisation pour la page Abonnement. */
export async function proBillingView(organizationId: string, now = new Date()) {
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  const [invoices, last, inProgress] = await Promise.all([
    db.proInvoice.findMany({
      where: { organizationId },
      orderBy: { issuedAt: "desc" },
      take: 24,
      select: {
        id: true,
        number: true,
        issuedAt: true,
        totalMinor: true,
        currency: true,
      },
    }),
    sub
      ? db.subscriptionPayment.findFirst({
          where: { subscriptionId: sub.id, kind: "RENEWAL" },
          orderBy: { createdAt: "desc" },
        })
      : null,
    sub ? paymentInProgress(sub.id, now) : false,
  ]);
  const nextAttempt =
    sub?.status === "PAST_DUE" && last?.status === "FAILED" && last.failedAt
      ? nextRenewalAttempt(last.failedAt, last.attempt)
      : null;
  return {
    invoices,
    renewalPending: last?.status === "PENDING",
    paymentInProgress: inProgress,
    nextAttempt:
      nextAttempt &&
      sub?.pastDueSince &&
      nextAttempt.getTime() <
        sub.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DAY
        ? nextAttempt
        : null,
  };
}
