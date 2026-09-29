"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { requirePermission } from "@evoly/core/organizers";

// ─────────────────────────────────────────
// ONBOARDING — Créer ou reprendre le compte Express
// ─────────────────────────────────────────

export async function createStripeConnectLinkAction(organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "BILLING_MANAGE");

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { stripeAccountId: true, stripeAccountStatus: true, email: true, name: true },
  });
  if (!org) return { error: "Organisation introuvable." };

  let accountId = org.stripeAccountId;

  // Créer le compte Express si inexistant
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: org.email ?? undefined,
      business_profile: { name: org.name },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    accountId = account.id;

    await db.organization.update({
      where: { id: organizationId },
      data: {
        stripeAccountId: accountId,
        stripeAccountStatus: "PENDING",
      },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/dashboard/${(await db.organization.findUnique({ where: { id: organizationId }, select: { slug: true } }))?.slug}/settings?stripe=refresh`,
    return_url: `${appUrl}/dashboard/${(await db.organization.findUnique({ where: { id: organizationId }, select: { slug: true } }))?.slug}/settings?stripe=success`,
    type: "account_onboarding",
  });

  return { success: true, url: link.url };
}

// ─────────────────────────────────────────
// DASHBOARD — Lien vers le portail Stripe Express
// ─────────────────────────────────────────

export async function getStripeExpressDashboardLinkAction(organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "BILLING_MANAGE");

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { stripeAccountId: true },
  });
  if (!org?.stripeAccountId) return { error: "Aucun compte Stripe connecté." };

  const link = await stripe.accounts.createLoginLink(org.stripeAccountId);
  return { success: true, url: link.url };
}
