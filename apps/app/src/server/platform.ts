import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CoreError, normalizeShortCode, ratePercent, riskSignals, type RiskSignal } from "@evoly/core";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { audit } from "./audit";
import { sendEmail } from "./email/send";
import { sendOrderConfirmation } from "./orders";
import { settleResale } from "./resale";
import { getSession } from "./session";
import { twoFactorSatisfied } from "./twoFactor";
export { decryptSecret, encryptSecret, totpFor } from "./twoFactor";

// -- accès : équipe Evoly, double authentification obligatoire (module commun twoFactor.ts) --

const SUPPORT_COOKIE = "evoly_support_view";
const sign = (purpose: string, value: string) => createHmac("sha256", `${purpose}:${env().BETTER_AUTH_SECRET}`).update(value).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const secure = () => env().NEXT_PUBLIC_APP_URL.startsWith("https");

/** Membre de l'équipe Evoly connecté, et si sa double authentification est validée pour cette session. */
export async function currentStaff() {
  const s = await getSession();
  if (!s?.user) return null;
  const user = await db.user.findUnique({ where: { id: s.user.id }, select: { id: true, email: true, name: true, platformRole: true, twoFactorEnabled: true } });
  if (!user || user.platformRole === "NONE") return null;
  return { user, sessionId: s.session.id, verified: user.twoFactorEnabled && (await twoFactorSatisfied(user, s.session.id)) };
}
export type Staff = NonNullable<Awaited<ReturnType<typeof currentStaff>>>;

/** Pages et actions du back-office : 404 hors équipe Evoly, double authentification exigée, ADMIN pour agir. */
export async function requireStaff(level: "SUPPORT" | "ADMIN" = "SUPPORT"): Promise<Staff> {
  const st = await currentStaff();
  if (!st) notFound();
  if (!st.verified) redirect(st.user.twoFactorEnabled ? "/2fa?next=/admin" : "/admin/2fa");
  if (level === "ADMIN" && st.user.platformRole !== "ADMIN") notFound();
  return st;
}

// -- recherche, fiches, tableau de bord --

/** Recherche : organisations, utilisateurs, événements, commandes, billets, annonces de revente. */
export async function platformSearch(q: string) {
  const t = q.trim();
  if (t.length < 2) return null;
  const ci = { contains: t, mode: "insensitive" as const };
  const [organizations, users, events, orders, tickets, listings] = await Promise.all([
    db.organization.findMany({ where: { OR: [{ name: ci }, { slug: ci }, { subdomain: ci }, { legalName: ci }] }, select: { id: true, name: true, slug: true, status: true, createdAt: true }, take: 10 }),
    db.user.findMany({ where: { OR: [{ email: ci }, { name: ci }] }, select: { id: true, email: true, name: true, platformRole: true, memberships: { select: { organization: { select: { id: true, name: true } } } } }, take: 10 }),
    db.event.findMany({ where: { OR: [{ title: ci }, { publicCode: t.toUpperCase() }] }, select: { id: true, title: true, startsAt: true, status: true, organization: { select: { id: true, name: true } } }, take: 10 }),
    db.order.findMany({ where: { OR: [{ reference: { contains: t.toUpperCase() } }, { buyerEmail: ci }] }, select: { id: true, reference: true, buyerEmail: true, status: true, totalMinor: true, currency: true, organization: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.ticket.findMany({ where: { shortCode: normalizeShortCode(t) }, select: { id: true, shortCode: true, status: true, order: { select: { id: true, reference: true, organization: { select: { id: true, name: true } } } } }, take: 5 }),
    db.resaleListing.findMany({ where: { OR: [{ linkCode: ci }, { sellerEmail: ci }] }, select: { id: true, linkCode: true, status: true, priceMinor: true, event: { select: { title: true, organization: { select: { id: true, name: true } } } } }, take: 5 }),
  ]);
  return { organizations, users, events, orders, tickets, listings };
}

const COUNTED = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

/** Fiche organisation : offre, abonnement, Stripe, événements, volumes, remboursements, litiges, journal d'audit. */
export async function organizationSheet(id: string, now = new Date()) {
  const org = await db.organization.findUnique({ where: { id }, include: { subscription: true, stripeAccount: true, featureFlags: true, _count: { select: { members: true, events: true } } } });
  if (!org) return null;
  const [sales, refunds, refundedOrders, disputes, openDisputes, failedListings, auditLog, events, maxPrice] = await Promise.all([
    db.order.aggregate({ where: { organizationId: id, status: { in: [...COUNTED] } }, _count: true, _sum: { totalMinor: true, applicationFeeMinor: true } }),
    db.refund.aggregate({ where: { order: { organizationId: id }, status: { in: ["SUCCEEDED", "PROCESSING"] } }, _count: true, _sum: { amountMinor: true } }),
    db.order.count({ where: { organizationId: id, status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } } }),
    org.stripeAccount ? db.dispute.count({ where: { accountId: org.stripeAccount.stripeAccountId } }) : 0,
    org.stripeAccount ? db.dispute.count({ where: { accountId: org.stripeAccount.stripeAccountId, status: { in: ["NEEDS_RESPONSE", "WARNING_NEEDS_RESPONSE", "UNDER_REVIEW", "WARNING_UNDER_REVIEW"] } } }) : 0,
    db.resaleListing.findMany({ where: { event: { organizationId: id }, status: "FAILED" }, select: { id: true, linkCode: true, failureReason: true, priceMinor: true, event: { select: { title: true } } } }),
    db.auditLog.findMany({ where: { organizationId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.event.findMany({ where: { organizationId: id }, select: { id: true, title: true, startsAt: true, status: true }, orderBy: { startsAt: "desc" }, take: 10 }),
    db.ticketType.aggregate({ where: { event: { organizationId: id } }, _max: { priceMinor: true } }),
  ]);
  const risks: RiskSignal[] = riskSignals({ createdAt: org.createdAt, maxTicketPriceMinor: maxPrice._max.priceMinor ?? 0, paidOrders: sales._count, disputes, refundedOrders }, now);
  return { org, sales: { orders: sales._count, grossMinor: sales._sum.totalMinor ?? 0, commissionMinor: sales._sum.applicationFeeMinor ?? 0 }, refunds: { count: refunds._count, amountMinor: refunds._sum.amountMinor ?? 0 }, disputes: { total: disputes, open: openDisputes }, failedListings, auditLog, events, risks };
}

/** Tableau de bord : volumes, commissions, organisations actives, abonnements, taux de litiges et de remboursements. */
export async function platformDashboard(now = new Date()) {
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d90 = new Date(now.getTime() - 90 * 86_400_000);
  const [sales30, active, pro, trialing, pastDue, paid90, disputes90, refunded90] = await Promise.all([
    db.order.aggregate({ where: { status: { in: [...COUNTED] }, paidAt: { gte: d30 } }, _sum: { totalMinor: true, applicationFeeMinor: true }, _count: true }),
    db.order.groupBy({ by: ["organizationId"], where: { status: { in: [...COUNTED] }, paidAt: { gte: d30 } } }),
    db.subscription.count({ where: { planId: "pro", status: "ACTIVE" } }),
    db.subscription.count({ where: { planId: "pro", status: "TRIALING" } }),
    db.subscription.count({ where: { planId: "pro", status: { in: ["PAST_DUE", "UNPAID"] } } }),
    db.order.count({ where: { status: { in: [...COUNTED] }, paidAt: { gte: d90 } } }),
    db.dispute.count({ where: { createdAt: { gte: d90 } } }),
    db.order.count({ where: { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] }, paidAt: { gte: d90 } } }),
    Promise.resolve(null),
  ]);
  // signaux de risque : candidats trouvés par requêtes ciblées (exhaustif), puis règles de riskSignals (source unique)
  const [newHighPrice, paidBy, refundedBy, disputesBy] = await Promise.all([
    db.organization.findMany({ where: { createdAt: { gte: d30 }, status: { not: "DELETED" }, events: { some: { ticketTypes: { some: { priceMinor: { gte: 15_000 } } } } } }, select: { id: true } }),
    db.order.groupBy({ by: ["organizationId"], where: { status: { in: [...COUNTED] } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["organizationId"], where: { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } }, _count: { _all: true } }),
    db.dispute.groupBy({ by: ["accountId"], _count: { _all: true } }),
  ]);
  const accounts = await db.stripeAccount.findMany({ where: { stripeAccountId: { in: disputesBy.map((d) => d.accountId) } }, select: { stripeAccountId: true, organizationId: true } });
  const paid = new Map(paidBy.map((r) => [r.organizationId, r._count._all]));
  const refunded = new Map(refundedBy.map((r) => [r.organizationId, r._count._all]));
  const disputesOf = new Map(accounts.map((a) => [a.organizationId, disputesBy.find((d) => d.accountId === a.stripeAccountId)?._count._all ?? 0]));
  const candidates = new Set<string>([...newHighPrice.map((o) => o.id), ...[...disputesOf.keys()], ...[...refunded.keys()].filter((id) => (paid.get(id) ?? 0) >= 20)]);
  const orgs = await db.organization.findMany({ where: { id: { in: [...candidates] }, status: { not: "DELETED" } }, select: { id: true, name: true, createdAt: true, events: { select: { ticketTypes: { select: { priceMinor: true }, orderBy: { priceMinor: "desc" }, take: 1 } } } } });
  const risky = orgs
    .map((o) => ({ id: o.id, name: o.name, risks: riskSignals({ createdAt: o.createdAt, maxTicketPriceMinor: Math.max(0, ...o.events.flatMap((e) => e.ticketTypes.map((t) => t.priceMinor))), paidOrders: paid.get(o.id) ?? 0, disputes: disputesOf.get(o.id) ?? 0, refundedOrders: refunded.get(o.id) ?? 0 }, now) }))
    .filter((r) => r.risks.length > 0);
  return { grossMinor: sales30._sum.totalMinor ?? 0, commissionMinor: sales30._sum.applicationFeeMinor ?? 0, orders30: sales30._count, activeOrganizations: active.length, subscriptions: { pro, trialing, pastDue }, disputeRate: ratePercent(disputes90, paid90), refundRate: ratePercent(refunded90, paid90), risky };
}

// -- actions (ADMIN), toutes journalisées --

const log = (st: Staff, action: string, organizationId: string | null, metadata?: Record<string, string | number | boolean | null>) => audit({ action, organizationId, actorType: "ADMIN", actorUserId: st.user.id, targetType: "Organization", targetId: organizationId ?? st.user.id, metadata });

export async function suspendOrganization(st: Staff, id: string, reason: string) {
  const org = await db.organization.update({ where: { id }, data: { status: "SUSPENDED" } });
  await log(st, "platform.organization_suspended", id, { reason });
  const owner = await db.organizationMember.findFirst({ where: { organizationId: id, role: { systemKey: "OWNER" } }, include: { user: { select: { email: true } } } });
  if (owner) await sendEmail({ to: owner.user.email, template: "platform.suspended", category: "SERVICE", organizationId: id, subject: `Organisation suspendue : ${org.name}`, text: `Votre organisation ${org.name} est suspendue par Evoly : les ventes sont interrompues.\n\nMotif : ${reason}\n\nRépondez à cet e-mail pour en discuter.\n\nEvoly`, html: `<p>Votre organisation <strong>${org.name.replace(/</g, "&lt;")}</strong> est suspendue par Evoly : les ventes sont interrompues.</p><p>Motif : ${reason.replace(/</g, "&lt;")}</p><p>Répondez à cet e-mail pour en discuter.</p>` }).catch(() => undefined);
}

export async function reactivateOrganization(st: Staff, id: string) {
  await db.organization.update({ where: { id, status: "SUSPENDED" }, data: { status: "ACTIVE" } });
  await log(st, "platform.organization_reactivated", id);
}

/** Prolonge l'essai en cours (et chez Stripe s'il y a un abonnement), ou ouvre un essai Pro géré par Evoly. */
export async function extendTrial(st: Staff, id: string, days: number, now = new Date()) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new CoreError("TRIAL_DAYS_INVALID");
  const sub = await db.subscription.findUnique({ where: { organizationId: id } });
  const base = sub?.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt > now ? sub.trialEndsAt : now;
  const end = new Date(base.getTime() + days * 86_400_000);
  if (sub?.stripeSubscriptionId) await stripe()?.subscriptions.update(sub.stripeSubscriptionId, { trial_end: Math.floor(end.getTime() / 1000), proration_behavior: "none" }).catch((err) => { throw new CoreError(`STRIPE_${String(err?.code ?? "ERROR").toUpperCase()}`); });
  await db.subscription.upsert({ where: { organizationId: id }, create: { organizationId: id, planId: "pro", status: "TRIALING", trialEndsAt: end, currentPeriodEnd: end }, update: { planId: "pro", status: "TRIALING", trialEndsAt: end, currentPeriodEnd: end } });
  await log(st, "platform.trial_extended", id, { days, until: end.toISOString() });
}

/** Offre attribuée par Evoly (sans abonnement Stripe) : Pro jusqu'à une date, ou sans limite ; ou retour en Free. */
export async function assignPlan(st: Staff, id: string, planId: "pro" | "free", until: Date | null) {
  const sub = await db.subscription.findUnique({ where: { organizationId: id } });
  if (sub?.stripeSubscriptionId && ["TRIALING", "ACTIVE", "PAST_DUE", "UNPAID"].includes(sub.status)) throw new CoreError("PLAN_MANAGED_BY_STRIPE");
  const data = planId === "free" ? { planId: "free", status: "NONE" as const, currentPeriodEnd: null } : until ? { planId: "pro", status: "CANCELED" as const, currentPeriodEnd: until, cancelAtPeriodEnd: true } : { planId: "pro", status: "ACTIVE" as const, currentPeriodEnd: null };
  await db.subscription.upsert({ where: { organizationId: id }, create: { organizationId: id, ...data }, update: data });
  await log(st, "platform.plan_assigned", id, { planId, until: until?.toISOString() ?? null });
}

export async function resendOrderEmail(st: Staff, orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, organizationId: true } });
  await sendOrderConfirmation(order.id);
  await log(st, "platform.order_email_resent", order.organizationId, { orderId });
}

/** RG-RSL-06 : revente dont le remboursement du vendeur a échoué, relancée après correction. */
export async function retryFailedResale(st: Staff, listingId: string) {
  const listing = await db.resaleListing.findUniqueOrThrow({ where: { id: listingId }, include: { event: { select: { organizationId: true } } } });
  if (listing.status !== "FAILED") throw new CoreError("RESALE_NOT_FAILED");
  const buyerOrder = await db.order.findFirst({ where: { resaleListing: { is: { id: listing.id } }, source: "RESALE" }, select: { id: true } });
  if (!buyerOrder) throw new CoreError("NOT_FOUND");
  await db.resaleListing.update({ where: { id: listing.id }, data: { status: "SOLD", failureReason: null } });
  await settleResale(buyerOrder.id);
  const after = await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id }, select: { status: true } });
  await log(st, "platform.resale_retried", listing.event.organizationId, { listingId, outcome: after.status });
  return after.status;
}

/** Activation progressive (FeatureFlag) : pour une organisation, ou pour toutes (organisation vide). */
export async function setFeatureFlag(st: Staff, key: string, organizationId: string | null, enabled: boolean) {
  const k = key.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 60);
  if (!k) throw new CoreError("FLAG_KEY_INVALID");
  const existing = await db.featureFlag.findFirst({ where: { key: k, organizationId } });
  if (existing) await db.featureFlag.update({ where: { id: existing.id }, data: { enabled } });
  else await db.featureFlag.create({ data: { key: k, organizationId, enabled } });
  await log(st, "platform.feature_flag", organizationId, { key: k, enabled });
}

/** Fonctionnalité activée pour une organisation (réglage propre à l'organisation, sinon réglage global). */
export async function featureEnabled(key: string, organizationId: string): Promise<boolean> {
  const flags = await db.featureFlag.findMany({ where: { key, OR: [{ organizationId }, { organizationId: null }] } });
  return (flags.find((f) => f.organizationId === organizationId) ?? flags.find((f) => f.organizationId === null))?.enabled ?? false;
}

// -- consultation en lecture seule de l'app d'un organisateur, journalisée --

export async function startSupportView(st: Staff, organizationId: string): Promise<string> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, slug: true } });
  await log(st, "platform.support_view_started", org.id);
  (await cookies()).set(SUPPORT_COOKIE, `${org.id}.${sign("support", `${org.id}:${st.user.id}:${st.sessionId}`)}`, { httpOnly: true, sameSite: "strict", secure: secure(), path: "/", maxAge: 3600 });
  return org.slug;
}

export async function stopSupportView() {
  (await cookies()).delete(SUPPORT_COOKIE);
}

/** Pour le contexte d'organisation : consultation support ouverte pour cette organisation, par ce membre d'Evoly. */
export async function supportViewAllowed(organizationSlug: string): Promise<boolean> {
  const st = await currentStaff();
  if (!st?.verified) return false;
  const [orgId, sig] = ((await cookies()).get(SUPPORT_COOKIE)?.value ?? "").split(".");
  if (!orgId || !sig || !same(sig, sign("support", `${orgId}:${st.user.id}:${st.sessionId}`))) return false;
  return !!(await db.organization.findFirst({ where: { id: orgId, slug: organizationSlug }, select: { id: true } }));
}
