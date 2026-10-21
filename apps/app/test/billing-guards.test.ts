import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { openPortal, startCheckout, switchInterval } from "@/server/billing";
import { findOrgContext } from "@/server/context";

// abonnement Pro : garde-fous avant tout appel coûteux à Stripe (indisponible, déjà abonné, sans abonnement, même rythme)
const fake = vi.hoisted(() => ({
  available: true,
  items: [] as Array<{ id: string; price: { recurring: { interval: string } } }>,
  updates: 0,
  portals: [] as string[],
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () =>
    fake.available
      ? {
          billingPortal: {
            sessions: { create: async (p: { customer: string }) => (fake.portals.push(p.customer), { url: `https://billing.stripe.test/${p.customer}` }) },
          },
          subscriptions: {
            retrieve: async (id: string) => ({ id, items: { data: fake.items } }),
            update: async () => {
              fake.updates++;
              return {};
            },
          },
        }
      : null,
}));
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(sub?: { status: string; stripeSubscriptionId?: string | null; stripeCustomerId?: string | null }) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (sub)
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: sub.status as never,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
        stripeCustomerId: sub.stripeCustomerId ?? null,
      },
    });
  return { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
}
const refused = (code: string) => expect.objectContaining({ code });
beforeEach(() => {
  fake.available = true;
  fake.items = [];
  fake.updates = 0;
  fake.portals = [];
});

describe("abonnement : garde-fous", () => {
  it("sans Stripe : souscrire, ouvrir le portail et changer de rythme sont refusés", async () => {
    fake.available = false;
    const ctx = await setup();
    await expect(startCheckout(ctx, "MONTH")).rejects.toEqual(refused("BILLING_UNAVAILABLE"));
    await expect(openPortal(ctx)).rejects.toEqual(refused("BILLING_UNAVAILABLE"));
    await expect(switchInterval(ctx, "YEAR")).rejects.toEqual(refused("BILLING_UNAVAILABLE"));
  });

  it("déjà abonné : une seconde souscription est refusée", async () => {
    const ctx = await setup({ status: "ACTIVE", stripeSubscriptionId: `sub_${rid()}`, stripeCustomerId: `cus_${rid()}` });
    await expect(startCheckout(ctx, "YEAR")).rejects.toEqual(refused("ALREADY_SUBSCRIBED"));
  });

  it("portail : refusé sans client Stripe ; ouvert pour le bon client", async () => {
    await expect(openPortal(await setup())).rejects.toEqual(refused("NO_SUBSCRIPTION"));
    const customer = `cus_${rid()}`;
    expect(await openPortal(await setup({ status: "ACTIVE", stripeSubscriptionId: `sub_${rid()}`, stripeCustomerId: customer }))).toBe(
      `https://billing.stripe.test/${customer}`,
    );
    expect(fake.portals).toEqual([customer]);
  });

  it("changement de rythme : refusé sans abonnement ou sans ligne ; même rythme : rien demandé à Stripe", async () => {
    await expect(switchInterval(await setup(), "YEAR")).rejects.toEqual(refused("NOT_SUBSCRIBED"));
    await expect(switchInterval(await setup({ status: "CANCELED", stripeSubscriptionId: `sub_${rid()}` }), "YEAR")).rejects.toEqual(refused("NOT_SUBSCRIBED"));
    const ctx = await setup({ status: "ACTIVE", stripeSubscriptionId: `sub_${rid()}`, stripeCustomerId: `cus_${rid()}` });
    await expect(switchInterval(ctx, "YEAR")).rejects.toEqual(refused("NOT_SUBSCRIBED")); // abonnement Stripe sans ligne
    fake.items = [{ id: "si_1", price: { recurring: { interval: "year" } } }];
    await expect(switchInterval(ctx, "YEAR")).resolves.toBeUndefined();
    expect(fake.updates).toBe(0);
  });
});
