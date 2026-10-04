import { describe, expect, it } from "vitest";
import { trialEligible } from "@evoly/core";
import { db } from "@/lib/db";
import { invoiceFailed, invoicePaid, syncSubscription } from "@/server/billing";
import { reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function setup() {
  const id = rid();
  const [owner, admin] = await Promise.all([db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } }), db.user.create({ data: { name: "Sam Admin", email: `adm.${id}@exemple.be`, emailVerified: true } })]);
  const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const [ownerRole, adminRole] = await Promise.all([db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } }), db.role.findFirstOrThrow({ where: { systemKey: "ADMIN" } })]);
  await db.organizationMember.createMany({ data: [{ organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" }, { organizationId: org.id, userId: admin.id, roleId: adminRole.id, status: "ACTIVE" }] });
  const event = await db.event.create({
    data: { organizationId: org.id, slug: `soiree-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Soirée ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 20 * DAY), status: "PUBLISHED", ticketTypes: { create: { name: "Entrée", priceMinor: 5000, currency: "EUR", quantity: 100 } } },
    include: { ticketTypes: true },
  });
  const fee = async () => (await db.order.findUniqueOrThrow({ where: { id: (await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" })).orderId } })).applicationFeeMinor;
  const stripeSub = (status: string, extra: Partial<{ periodEnd: number; cancelAtPeriodEnd: boolean; cancelAt: number }> = {}) => ({
    id: `sub_${id}`,
    status: status as "trialing",
    metadata: { organizationId: org.id },
    customer: `cus_${id}`,
    trial_end: Math.floor((Date.now() + 14 * DAY) / 1000),
    cancel_at_period_end: extra.cancelAtPeriodEnd ?? false,
    cancel_at: extra.cancelAt ?? null,
    canceled_at: null,
    items: { data: [{ current_period_start: Math.floor(Date.now() / 1000), current_period_end: extra.periodEnd ?? Math.floor((Date.now() + 14 * DAY) / 1000), price: { recurring: { interval: "year" } } }] },
  });
  return { id, org, owner, admin, fee, stripeSub };
}

describe("abonnement Pro (RG-SUB-01 à 08)", () => {
  it("essai démarré par webhook : plafond Pro pour les nouvelles commandes, un seul essai, e-mail au propriétaire", async () => {
    const s = await setup();
    expect(await s.fee()).toBe(129); // Free : 0,29 € + 2 % de 50 € = 1,29 €
    expect(trialEligible(await db.subscription.findUnique({ where: { organizationId: s.org.id } }))).toBe(true);
    expect(await syncSubscription(s.stripeSub("trialing"))).toBe(true);
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } });
    expect(sub).toMatchObject({ planId: "pro", status: "TRIALING", interval: "YEAR", stripeSubscriptionId: `sub_${s.id}` });
    expect(await s.fee()).toBe(100); // RG-SUB-07 : plafond Pro à 1 €
    expect(trialEligible(sub)).toBe(false);
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "subscription.started", toEmail: s.owner.email } })).toBe(1);
  });

  it("résiliation par date de fin (cancel_at, portail Stripe récent) : reconnue comme programmée, accès jusqu'à cette date", async () => {
    const s = await setup();
    const trialEnd = Math.floor((Date.now() + 14 * DAY) / 1000);
    await syncSubscription(s.stripeSub("trialing", { cancelAt: trialEnd }));
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } });
    expect(sub).toMatchObject({ status: "TRIALING", cancelAtPeriodEnd: true });
    expect(sub.currentPeriodEnd?.getTime()).toBe(trialEnd * 1000);
    // date de fin antérieure à la fin de période : c'est elle qui compte
    const earlier = Math.floor((Date.now() + 3 * DAY) / 1000);
    await syncSubscription(s.stripeSub("trialing", { cancelAt: earlier }));
    expect((await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } })).currentPeriodEnd?.getTime()).toBe(earlier * 1000);
  });

  it("retour en Free : membres suspendus sans rien supprimer, rétablis au retour en Pro (RG-SUB-08)", async () => {
    const s = await setup();
    await syncSubscription(s.stripeSub("active"));
    expect(await findOrgContext(s.admin.id, s.org.slug)).not.toBeNull();
    await syncSubscription(s.stripeSub("canceled", { periodEnd: Math.floor((Date.now() - DAY) / 1000) }));
    expect(await findOrgContext(s.admin.id, s.org.slug)).toBeNull();
    expect(await findOrgContext(s.owner.id, s.org.slug)).not.toBeNull();
    expect(await db.organizationMember.count({ where: { organizationId: s.org.id } })).toBe(2);
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "subscription.ended" } })).toBe(1);
    await syncSubscription(s.stripeSub("active"));
    expect(await findOrgContext(s.admin.id, s.org.slug)).not.toBeNull();
  });

  it("impayé : reste Pro pendant 7 jours, e-mail à chaque échec, rétabli au paiement (RG-SUB-06)", async () => {
    const s = await setup();
    await syncSubscription(s.stripeSub("active"));
    await invoiceFailed(`sub_${s.id}`);
    let sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } });
    expect(sub.status).toBe("PAST_DUE");
    expect(sub.pastDueSince).not.toBeNull();
    expect(await s.fee()).toBe(100);
    await invoiceFailed(`sub_${s.id}`);
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "subscription.payment_failed" } })).toBe(2);
    await db.subscription.update({ where: { id: sub.id }, data: { pastDueSince: new Date(Date.now() - 8 * DAY) } });
    expect(await s.fee()).toBe(129); // au-delà de 7 jours : commission Free
    await invoicePaid(`sub_${s.id}`);
    sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } });
    expect(sub).toMatchObject({ status: "ACTIVE", pastDueSince: null });
  });
});
