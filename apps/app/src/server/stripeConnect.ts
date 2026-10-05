import "server-only";
import { baseLocale } from "@evoly/i18n";
import type { Locale } from "@evoly/i18n";
import { notify } from "./notifications";
import { CoreError } from "@evoly/core";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { audit } from "./audit";
import type { OrgContext } from "./context";

type Status = "PENDING" | "ACTIVE" | "RESTRICTED" | "RESTRICTED_SOON" | "DISABLED";

/** Statut Evoly d'un compte connecté, à partir de l'état renvoyé par Stripe (section 9.16). */
export function accountStatus(account: Pick<Stripe.Account, "charges_enabled" | "payouts_enabled" | "details_submitted" | "requirements">): Status {
  const req = account.requirements;
  if (req?.disabled_reason?.startsWith("rejected")) return "DISABLED";
  if (account.charges_enabled && account.payouts_enabled) return (req?.eventually_due?.length ?? 0) > 0 ? "RESTRICTED_SOON" : "ACTIVE";
  if (!account.details_submitted) return "PENDING";
  return "RESTRICTED";
}

/** Enregistre l'état d'un compte connecté (onboarding, retour de Stripe, webhook account.updated). */
async function syncStripeAccountRecord(account: Stripe.Account): Promise<void> {
  await db.stripeAccount.update({
    where: { stripeAccountId: account.id },
    data: {
      status: accountStatus(account),
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirementsDue: [...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])],
      disabledReason: account.requirements?.disabled_reason ?? null,
      defaultCurrency: (account.default_currency ?? "eur").toUpperCase(),
    },
  });
}

/**
 * Démarre ou reprend l'onboarding Stripe de l'organisation (RG-PAY-01) :
 * compte où Stripe facture ses frais à l'organisateur, tableau de bord Stripe complet (créé avec Accounts v2).
 */
export async function stripeOnboardingUrl(ctx: OrgContext): Promise<string> {
  const s = stripe();
  if (!s) throw new CoreError("STRIPE_NOT_CONFIGURED");
  const existing = await db.stripeAccount.findUnique({ where: { organizationId: ctx.organization.id } });
  let accountId = existing?.stripeAccountId;
  if (!accountId) {
    // Accounts v2, recommandé par Stripe pour les nouvelles plateformes (la création v1 est refusée par défaut).
    // Mêmes choix qu'avant : tableau de bord Stripe complet, frais facturés et pertes assumées par Stripe.
    // C'est le même compte logique qu'en v1 : statut (accounts.retrieve), paiements, remboursements et
    // webhooks v1 (account.updated, envoyé aussi pour les comptes v2) restent inchangés.
    const account = await s.v2.core.accounts.create({
      contact_email: ctx.organization.contactEmail ?? ctx.user.email,
      display_name: ctx.organization.name,
      dashboard: "full",
      identity: { country: ctx.organization.country.toLowerCase() },
      defaults: {
        currency: ctx.organization.currency.toLowerCase(),
        locales: [baseLocale(ctx.organization.locale)],
        responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
      },
      configuration: { merchant: { capabilities: { card_payments: { requested: true }, bancontact_payments: { requested: true } } } },
      metadata: { organizationId: ctx.organization.id },
    });
    accountId = account.id;
    await db.stripeAccount.create({
      data: {
        organizationId: ctx.organization.id,
        stripeAccountId: account.id,
        country: ctx.organization.country,
        defaultCurrency: ctx.organization.currency,
        status: "PENDING",
      },
    });
    await audit({
      action: "stripe.account_created",
      organizationId: ctx.organization.id,
      actorUserId: ctx.user.id,
      targetType: "StripeAccount",
      targetId: account.id,
      metadata: { api: "v2" },
    });
  }
  const base = `${env().NEXT_PUBLIC_APP_URL}/o/${ctx.organization.slug}/settings/payments`;
  try {
    const link = await s.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: { configurations: ["merchant"], refresh_url: `${base}?stripe=refresh`, return_url: `${base}?stripe=return` },
      },
    });
    return link.url;
  } catch (err) {
    // compte créé avant le passage à Accounts v2 : lien d'inscription v1 (seule la création v1 est restreinte)
    console.warn("lien d'inscription v2 indisponible, repli v1", err instanceof Error ? err.message.slice(0, 200) : "");
    const link = await s.accountLinks.create({
      account: accountId,
      refresh_url: `${base}?stripe=refresh`,
      return_url: `${base}?stripe=return`,
      type: "account_onboarding",
    });
    return link.url;
  }
}

/** Au retour de l'onboarding : relit le compte chez Stripe et met à jour son statut. */
export async function refreshStripeAccount(organizationId: string): Promise<void> {
  const s = stripe();
  const existing = await db.stripeAccount.findUnique({ where: { organizationId } });
  if (!s || !existing) return;
  await syncStripeAccount(await s.accounts.retrieve(existing.stripeAccountId));
}

/**
 * RG-DOM-04 : chaque hôte qui affiche un paiement est déclaré comme domaine de paiement sur le compte
 * de l'organisateur, pour qu'Apple Pay et Google Pay s'affichent. Les hôtes locaux sont ignorés.
 */
export async function ensurePaymentDomains(organizationId: string): Promise<void> {
  const s = stripe();
  if (!s) return;
  const [org, account] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { subdomain: true } }),
    db.stripeAccount.findUnique({ where: { organizationId } }),
  ]);
  if (!org?.subdomain || !account?.chargesEnabled) return;
  const base = env().NEXT_PUBLIC_BASE_DOMAIN;
  if (base.includes("localhost")) return;
  // tous les hôtes qui affichent un paiement : organisation, événements et domaines personnalisés actifs
  const [events, domains] = await Promise.all([
    db.event.findMany({ where: { organizationId, subdomain: { not: null }, deletedAt: null }, select: { subdomain: true } }),
    db.customDomain.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, domain: true } }),
  ]);
  const hosts = [`${org.subdomain}.${base}`, ...events.map((e) => `${e.subdomain}.${base}`), ...domains.map((d) => d.domain)];
  const missing = [...new Set(hosts)].filter((h) => !account.paymentDomains.includes(h));
  for (const host of missing) await s.paymentMethodDomains.create({ domain_name: host }, { stripeAccount: account.stripeAccountId });
  if (missing.length > 0) await db.stripeAccount.update({ where: { id: account.id }, data: { paymentDomains: { push: missing } } });
  const registered = domains.filter((d) => missing.includes(d.domain) || account.paymentDomains.includes(d.domain)).map((d) => d.id);
  if (registered.length > 0) await db.customDomain.updateMany({ where: { id: { in: registered } }, data: { applePayRegistered: true } });
}

/** Synchronise le compte Stripe, puis déclare les domaines de paiement dès que les paiements sont actifs. */
export async function syncStripeAccount(account: Stripe.Account) {
  const before = await db.stripeAccount.findUnique({ where: { stripeAccountId: account.id }, select: { status: true, requirementsDue: true } });
  const result = await syncStripeAccountRecord(account);
  const row = await db.stripeAccount.findUnique({
    where: { stripeAccountId: account.id },
    select: { organizationId: true, status: true, requirementsDue: true },
  });
  // section 9.20 : action requise quand Stripe demande de nouvelles informations ou restreint le compte
  const due = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  if (
    row &&
    ((due(row.requirementsDue) > 0 && due(before?.requirementsDue) === 0) ||
      (row.status !== before?.status && ["RESTRICTED", "RESTRICTED_SOON", "DISABLED"].includes(row.status)))
  )
    await notify(row.organizationId, "STRIPE_ACTION_REQUIRED", {
      title: "Compte Stripe",
      body: "Stripe demande des informations pour que les paiements et les virements continuent.",
      link: "/settings/payments",
    });
  if (row) await ensurePaymentDomains(row.organizationId).catch((err) => console.error("domaines de paiement", err));
  return result;
}
