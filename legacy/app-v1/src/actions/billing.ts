"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { requirePermission } from "@evoly/core/organizers";

// ─────────────────────────────────────────
// UPGRADE TO PRO — Stripe Checkout
// ─────────────────────────────────────────

export async function createProCheckoutAction(
  organizationId: string,
  interval: "month" | "year"
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "BILLING_MANAGE");

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true, name: true, email: true, stripeCustomerId: true, planId: true },
  });
  if (!org) return { error: "Organisation introuvable." };
  if (org.planId === "pro") return { error: "Vous êtes déjà sur le plan Pro." };

  const plan = await db.plan.findUnique({ where: { id: "pro" } });
  if (!plan) return { error: "Plan introuvable." };

  const priceId = interval === "year" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) return { error: "Prix Stripe non configuré." };

  // Get or create Stripe customer
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: org.email ?? undefined,
      metadata: { organizationId },
    });
    customerId = customer.id;
    await db.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId: customerId },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { organizationId },
    },
    success_url: `${appUrl}/dashboard/${org.slug}/billing?success=true`,
    cancel_url: `${appUrl}/dashboard/${org.slug}/billing`,
    metadata: { organizationId, billing: interval === "year" ? "yearly" : "monthly" },
  });

  return { success: true, url: checkoutSession.url };
}

// ─────────────────────────────────────────
// MANAGE BILLING — Portail Stripe
// ─────────────────────────────────────────

export async function createBillingPortalAction(organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "BILLING_MANAGE");

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true, stripeCustomerId: true },
  });
  if (!org?.stripeCustomerId) return { error: "Aucun abonnement actif." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appUrl}/dashboard/${org.slug}/billing`,
  });

  return { success: true, url: portalSession.url };
}
