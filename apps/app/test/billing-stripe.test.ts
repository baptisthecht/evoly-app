import { beforeEach, describe, expect, it, vi } from "vitest";

// faux client Stripe : chaque appel est enregistré, aucune requête ne part
const fake = {
  customers: { create: vi.fn(async (_data?: unknown, _opts?: unknown) => ({ id: `cus_${Math.random().toString(36).slice(2, 8)}` })) },
  checkout: { sessions: { create: vi.fn(async (_data?: unknown, _opts?: unknown) => ({ url: "https://checkout.stripe.com/c/pay/cs_test" })) } },
  billingPortal: { sessions: { create: vi.fn(async () => ({ url: "https://billing.stripe.com/p/session/test" })) } },
  subscriptions: {
    retrieve: vi.fn(async (id: string) => ({
      id,
      items: { data: [{ id: "si_1", price: { id: "price_m", product: "prod_pro", recurring: { interval: "month" } } }] },
    })),
    update: vi.fn(async (_id?: string, _data?: unknown) => ({})),
  },
  prices: { list: vi.fn(async () => ({ data: [] })), search: vi.fn(async () => ({ data: [] })) },
};
vi.mock("@/lib/stripe", () => ({ stripe: () => fake }));

const { db } = await import("@/lib/db");
const { findOrgContext } = await import("@/server/context");
const { openPortal, startCheckout, switchInterval } = await import("@/server/billing");

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(sub?: Record<string, unknown>) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (sub) await db.subscription.create({ data: { organizationId: org.id, ...sub } as never });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { org, ctx };
}

describe("abonnement Pro par Stripe (section 9.21)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passage à Pro : client Stripe créé une seule fois, session de paiement en abonnement liée à l'organisation", async () => {
    const s = await setup();
    expect(await startCheckout(s.ctx, "MONTH")).toBe("https://checkout.stripe.com/c/pay/cs_test");
    expect(fake.customers.create).toHaveBeenCalledTimes(1);
    expect(fake.customers.create.mock.calls[0]![1]).toEqual({ idempotencyKey: `customer:${s.org.id}` }); // jamais deux clients pour une organisation
    const session = fake.checkout.sessions.create.mock.calls[0]![0] as {
      mode: string;
      metadata: Record<string, string>;
      subscription_data: { metadata: Record<string, string> };
    };
    expect(session.mode).toBe("subscription");
    expect(session.metadata.organizationId).toBe(s.org.id);
    expect(session.subscription_data.metadata.organizationId).toBe(s.org.id);
    await startCheckout(s.ctx, "YEAR"); // client déjà connu : pas de second client
    expect(fake.customers.create).toHaveBeenCalledTimes(1);
  });

  it("refus : déjà abonné ; portail sans abonnement ; changement de rythme sans abonnement actif", async () => {
    const pro = await setup({ planId: "pro", status: "ACTIVE", stripeCustomerId: `cus_${rid()}`, stripeSubscriptionId: `sub_${rid()}` });
    await expect(startCheckout(pro.ctx, "MONTH")).rejects.toMatchObject({ code: "ALREADY_SUBSCRIBED" });
    const free = await setup();
    await expect(openPortal(free.ctx)).rejects.toMatchObject({ code: "NO_SUBSCRIPTION" });
    await expect(switchInterval(free.ctx, "YEAR")).rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
  });

  it("portail client et passage de mensuel à annuel, au prorata ; même rythme : rien n'est changé", async () => {
    const s = await setup({ planId: "pro", status: "ACTIVE", stripeCustomerId: `cus_${rid()}`, stripeSubscriptionId: `sub_${rid()}` });
    expect(await openPortal(s.ctx)).toBe("https://billing.stripe.com/p/session/test");
    await switchInterval(s.ctx, "MONTH");
    expect(fake.subscriptions.update).not.toHaveBeenCalled();
    await switchInterval(s.ctx, "YEAR");
    expect(fake.subscriptions.update).toHaveBeenCalledTimes(1);
    const maj = fake.subscriptions.update.mock.calls[0]![1] as {
      proration_behavior: string;
      items: Array<{ id: string; price?: string; price_data?: { product: string; recurring: { interval: string } } }>;
    };
    expect(maj.proration_behavior).toBe("create_prorations");
    expect(maj.items[0]!.id).toBe("si_1"); // même ligne d'abonnement, nouveau prix
    if (maj.items[0]!.price_data) expect(maj.items[0]!.price_data).toMatchObject({ product: "prod_pro", recurring: { interval: "year" } });
  });
});
