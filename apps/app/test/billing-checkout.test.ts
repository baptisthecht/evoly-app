import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { startCheckout } from "@/server/billing";
import { findOrgContext } from "@/server/context";

// souscription au Pro (section 9.20) : client Stripe créé une seule fois, page de paiement au bon rythme et dans la langue
const fake = vi.hoisted(() => ({
  customers: [] as Array<Record<string, unknown>>,
  sessions: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    customers: {
      create: async (p: Record<string, unknown>) => (
        fake.customers.push(p),
        {
          id: `cus_${fake.customers.length}_${Math.random().toString(36).slice(2, 8)}`,
        }
      ),
    },
    checkout: {
      sessions: {
        create: async (p: Record<string, unknown>) => (
          fake.sessions.push(p),
          {
            id: `cs_${fake.sessions.length}`,
            url: `https://checkout.stripe.test/${fake.sessions.length}`,
          }
        ),
      },
    },
  }),
}));
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup() {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Daan Peeters",
      email: `daan.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Kring ${id}`,
      slug: `kring-${id}`,
      subdomain: `kring-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "nl",
    },
  });
  const ownerRole = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
  });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  return { ctx, org, owner };
}
beforeEach(() => {
  fake.customers = [];
  fake.sessions = [];
});

describe("souscription au Pro", () => {
  it("client Stripe créé une seule fois ; page de paiement mensuelle puis annuelle, en mode abonnement, en néerlandais ; inscrite à l'historique", async () => {
    const { ctx, org, owner } = await setup();
    const url = await startCheckout(ctx, "MONTH");
    expect(url).toBe("https://checkout.stripe.test/1");
    expect(fake.customers).toHaveLength(1);
    expect(fake.customers[0]).toMatchObject({ email: owner.email });
    expect(
      (
        await db.subscription.findUniqueOrThrow({
          where: { organizationId: org.id },
        })
      ).stripeCustomerId,
    ).toMatch(/^cus_/);
    expect(fake.sessions[0]).toMatchObject({
      mode: "subscription",
      locale: "nl",
    });
    expect(JSON.stringify(fake.sessions[0])).toContain('"interval":"month"');
    await startCheckout(ctx, "YEAR");
    expect(fake.customers).toHaveLength(1); // client déjà créé
    expect(JSON.stringify(fake.sessions[1])).toContain('"interval":"year"');
    expect(
      await db.auditLog.count({
        where: { organizationId: org.id, action: { startsWith: "billing." } },
      }),
    ).toBeGreaterThanOrEqual(2);
  });
});
