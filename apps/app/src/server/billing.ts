import "server-only";
import { notify } from "./notifications";
import { CoreError, daysBeforeDowngrade, effectivePlan, subscriptionStatusFromStripe, trialEligible } from "@evoly/core";
import type { Locale } from "@evoly/i18n";
import { toLocale } from "@evoly/i18n";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { sendEmail } from "./email/send";
import { subscriptionEmail } from "./email/templates";

const billingUrl = (slug: string) => `${env().NEXT_PUBLIC_APP_URL}/o/${slug}/billing`;

async function owner(organizationId: string) {
  const m = await db.organizationMember.findFirst({
    where: { organizationId, role: { systemKey: "OWNER" } },
    include: { user: { select: { email: true, name: true } } },
  });
  return m?.user ?? null;
}

/** Page Abonnement (section 9.21) : offre, statut, prix, droit à l'essai, délai avant rétrogradation. */
export async function billingState(ctx: OrgContext, now = new Date()) {
  const [sub, terms] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId: ctx.organization.id } }),
    db.planCurrencyTerms.findMany({ where: { currency: ctx.organization.currency } }),
  ]);
  const pro = terms.find((t) => t.planId === "pro");
  const free = terms.find((t) => t.planId === "free");
  return {
    plan: effectivePlan(sub, now),
    sub,
    trialEligible: trialEligible(sub),
    daysBeforeDowngrade: sub ? daysBeforeDowngrade(sub, now) : null,
    currency: ctx.organization.currency,
    prices: { MONTH: pro?.monthlyPriceMinor ?? 2900, YEAR: pro?.yearlyPriceMinor ?? 29580 },
    caps: { free: free?.feeCapMinor ?? 100, pro: pro?.feeCapMinor ?? 70 },
    stripeReady: !!stripe(),
  };
}

async function ensureCustomer(s: Stripe, ctx: OrgContext): Promise<string> {
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organization.id } });
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  const o = await db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id } });
  const who = await owner(o.id);
  const customer = await s.customers.create(
    {
      name: o.legalName ?? o.name,
      email: who?.email,
      preferred_locales: [o.locale],
      address: o.addressLine1
        ? { line1: o.addressLine1, line2: o.addressLine2 ?? undefined, postal_code: o.postalCode ?? undefined, city: o.city ?? undefined, country: o.country }
        : undefined,
      metadata: { organizationId: o.id },
    },
    { idempotencyKey: `customer:${o.id}` },
  );
  await db.subscription.upsert({
    where: { organizationId: o.id },
    create: { organizationId: o.id, stripeCustomerId: customer.id, currency: o.currency },
    update: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** RG-SUB-01, RG-SUB-02 : Stripe Checkout sur le compte d'Evoly, carte exigée, essai de 14 jours une seule fois. */
export async function startCheckout(ctx: OrgContext, interval: "MONTH" | "YEAR"): Promise<string> {
  const s = stripe();
  if (!s) throw new CoreError("BILLING_UNAVAILABLE");
  const state = await billingState(ctx);
  if (state.sub?.stripeSubscriptionId && ["TRIALING", "ACTIVE", "PAST_DUE", "UNPAID", "INCOMPLETE"].includes(state.sub.status))
    throw new CoreError("ALREADY_SUBSCRIBED");
  const customer = await ensureCustomer(s, ctx);
  const priceId = interval === "MONTH" ? env().STRIPE_PRICE_PRO_MONTH : env().STRIPE_PRICE_PRO_YEAR;
  const trialDays = state.trialEligible ? ((await db.plan.findUnique({ where: { id: "pro" }, select: { trialDays: true } }))?.trialDays ?? 14) : 0;
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: ctx.organization.id,
    line_items: [
      priceId
        ? { price: priceId, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: state.currency.toLowerCase(),
              unit_amount: state.prices[interval],
              tax_behavior: "inclusive",
              recurring: { interval: interval === "MONTH" ? "month" : "year" },
              product_data: { name: "Evoly Pro" },
            },
          },
    ],
    subscription_data: { metadata: { organizationId: ctx.organization.id }, ...(trialDays > 0 ? { trial_period_days: trialDays } : {}) },
    payment_method_collection: "always",
    allow_promotion_codes: true,
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    automatic_tax: { enabled: env().STRIPE_TAX_ENABLED === "true" },
    locale: toLocale(ctx.organization.locale), // Stripe Checkout existe dans toutes nos langues
    metadata: { organizationId: ctx.organization.id },
    success_url: `${billingUrl(ctx.organization.slug)}?checkout=success`,
    cancel_url: `${billingUrl(ctx.organization.slug)}?checkout=cancel`,
  });
  await audit({
    action: "billing.checkout_started",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Subscription",
    targetId: ctx.organization.id,
    metadata: { interval, trialDays },
  });
  return session.url!;
}

/** Section 9.21 : périodicité, moyen de paiement, factures, résiliation, via le portail client Stripe. */
export async function openPortal(ctx: OrgContext): Promise<string> {
  const s = stripe();
  if (!s) throw new CoreError("BILLING_UNAVAILABLE");
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organization.id } });
  if (!sub?.stripeCustomerId) throw new CoreError("NO_SUBSCRIPTION");
  const portal = await s.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: billingUrl(ctx.organization.slug),
    locale: ctx.organization.locale === "en" ? "en" : "fr",
  });
  return portal.url;
}

async function notifyOwner(organizationId: string, kind: "STARTED" | "TRIAL_ENDING" | "PAYMENT_FAILED" | "ENDED") {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, slug: true, locale: true } });
  const who = await owner(organizationId);
  if (!who) return;
  const mail = subscriptionEmail({
    kind,
    locale: toLocale(org.locale),
    organizationName: org.name,
    firstName: who.name.split(" ")[0] ?? who.name,
    url: billingUrl(org.slug),
  });
  await sendEmail({ ...mail, to: who.email, template: `subscription.${kind.toLowerCase()}`, category: "SERVICE", organizationId }).catch((err) =>
    console.error("e-mail d'abonnement", organizationId, err),
  );
}

type StripeSubscriptionLike = Pick<Stripe.Subscription, "id" | "status" | "metadata" | "trial_end" | "cancel_at_period_end" | "canceled_at"> & {
  cancel_at?: number | null;
  customer: string | { id: string };
  items: { data: Array<{ current_period_start?: number; current_period_end?: number; price?: { recurring?: { interval?: string } | null } | null }> };
};

/**
 * Synchronisation d'un abonnement Stripe (webhooks `customer.subscription.*`, `checkout.session.completed`).
 * Les effets du passage en Pro ou du retour en Free (RG-SUB-07, RG-SUB-08) sont calculés à la volée depuis le plan effectif :
 * rien n'est supprimé, tout revient au retour en Pro.
 */
export async function syncSubscription(sub: StripeSubscriptionLike, now = new Date()): Promise<boolean> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const organizationId =
    sub.metadata?.organizationId ||
    (await db.subscription.findFirst({ where: { OR: [{ stripeSubscriptionId: sub.id }, { stripeCustomerId: customerId }] }, select: { organizationId: true } }))
      ?.organizationId;
  if (!organizationId) return false;
  const existing = await db.subscription.findUnique({ where: { organizationId } });
  const status = subscriptionStatusFromStripe(sub.status);
  const item = sub.items.data[0];
  const toDate = (t?: number | null) => (t ? new Date(t * 1000) : null);
  const data = {
    planId: "pro",
    status,
    interval: item?.price?.recurring?.interval === "year" ? ("YEAR" as const) : ("MONTH" as const),
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    trialEndsAt: toDate(sub.trial_end) ?? existing?.trialEndsAt ?? null,
    currentPeriodStart: toDate(item?.current_period_start),
    // résiliation programmée : indicateur de fin de période, ou date de fin (cancel_at), selon la version de l'API et le portail ;
    // l'accès Pro s'arrête à la première des deux dates
    currentPeriodEnd: toDate(
      sub.cancel_at && item?.current_period_end ? Math.min(sub.cancel_at, item.current_period_end) : (item?.current_period_end ?? sub.cancel_at),
    ),
    cancelAtPeriodEnd: sub.cancel_at_period_end || !!sub.cancel_at,
    canceledAt: toDate(sub.canceled_at),
    pastDueSince: status === "PAST_DUE" || status === "UNPAID" ? (existing?.pastDueSince ?? now) : null,
  };
  const before = effectivePlan(existing, now);
  const saved = await db.subscription.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
  const after = effectivePlan(saved, now);
  if (before !== after) {
    await audit({
      action: after === "pro" ? "billing.upgraded" : "billing.downgraded",
      organizationId,
      actorType: "STRIPE",
      targetType: "Subscription",
      targetId: saved.id,
      metadata: { status },
    });
    await notifyOwner(organizationId, after === "pro" ? "STARTED" : "ENDED");
  }
  return true;
}

/** Rétrogradations dues au temps (impayé au-delà de 7 jours, fin de période résiliée), sans événement Stripe. */
export async function applyTimedDowngrades(now = new Date()): Promise<number> {
  const candidates = await db.subscription.findMany({
    where: { planId: "pro", OR: [{ status: { in: ["PAST_DUE", "UNPAID"] } }, { status: "CANCELED", currentPeriodEnd: { lte: now } }] },
  });
  let n = 0;
  for (const s of candidates) {
    if (effectivePlan(s, now) === "free" && effectivePlan(s, new Date(now.getTime() - 3_600_000)) !== "free") {
      n += 1;
      await notifyOwner(s.organizationId, "ENDED");
    }
  }
  return n;
}

export async function trialEnding(sub: { id: string }) {
  const row = await db.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
  if (row) {
    await notifyOwner(row.organizationId, "TRIAL_ENDING"); // RG-SUB-03
    await notify(
      row.organizationId,
      "TRIAL_ENDING",
      { title: "Fin de l'essai Pro", body: "Votre essai Pro se termine dans 3 jours.", link: "/billing" },
      { email: false },
    );
  }
}

/** Identifiant d'abonnement d'une facture (emplacement selon la version de l'API Stripe). */
export function invoiceSubscriptionId(
  inv: { parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null } & Record<string, unknown>,
): string | null {
  const nested = inv.parent?.subscription_details?.subscription;
  const legacy = inv.subscription as string | { id: string } | null | undefined;
  const v = nested ?? legacy;
  return typeof v === "string" ? v : (v?.id ?? null);
}

/** RG-SUB-06 : échec de paiement, statut impayé, e-mail à chaque échec. */
export async function invoiceFailed(subscriptionId: string | null, now = new Date()) {
  if (!subscriptionId) return;
  const row = await db.subscription.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  if (!row) return;
  await db.subscription.update({
    where: { id: row.id },
    data: { status: row.status === "UNPAID" ? "UNPAID" : "PAST_DUE", pastDueSince: row.pastDueSince ?? now },
  });
  await notifyOwner(row.organizationId, "PAYMENT_FAILED");
  await notify(
    row.organizationId,
    "SUBSCRIPTION_PAYMENT_FAILED",
    { title: "Paiement de l'abonnement", body: "Le paiement de l'abonnement Pro a échoué : mettez à jour votre moyen de paiement.", link: "/billing" },
    { email: false },
  );
}

export async function invoicePaid(subscriptionId: string | null) {
  if (!subscriptionId) return;
  const row = await db.subscription.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  if (row && (row.pastDueSince || row.status === "PAST_DUE" || row.status === "UNPAID"))
    await db.subscription.update({ where: { id: row.id }, data: { pastDueSince: null, status: "ACTIVE" } });
}
