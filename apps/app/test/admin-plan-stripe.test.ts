import { beforeEach, describe, expect, it, vi } from "vitest";

// Stripe simulé : on rejoue l'enchaînement réel « modification chez Stripe, puis notification de Stripe », absent des anciens tests
const calls: { method: string; args: unknown[] }[] = [];
const fake = {
  subscriptions: {
    cancel: async (...args: unknown[]) => (
      calls.push({ method: "cancel", args }),
      { id: args[0], status: "canceled" }
    ),
    update: async (...args: unknown[]) => (
      calls.push({ method: "update", args }),
      { id: args[0] }
    ),
  },
};
vi.mock("@/lib/stripe", () => ({ stripe: () => fake }));

const { db } = await import("@/lib/db");
const { assignPlan, extendTrial } = await import("@/server/platform");
const { syncSubscription } = await import("@/server/billing");
type Staff = Parameters<typeof assignPlan>[0];

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function setup() {
  const admin = await db.user.create({
    data: {
      name: "Admin",
      email: `a.${rid()}@evoly.me`,
      emailVerified: true,
      platformRole: "ADMIN",
      twoFactorEnabled: true,
    },
  });
  const st = {
    user: admin,
    session: { id: `s-${rid()}` },
    verified: true,
  } as unknown as Staff;
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${rid()}`,
      subdomain: `club-${rid()}`,
      country: "BE",
      currency: "EUR",
    },
  });
  const subId = `sub_${rid()}`;
  const customer = `cus_${rid()}`;
  const end = new Date(Date.now() + 20 * DAY);
  await db.subscription.create({
    data: {
      organizationId: org.id,
      planId: "pro",
      status: "ACTIVE",
      stripeCustomerId: customer,
      stripeSubscriptionId: subId,
      currentPeriodEnd: end,
    },
  });
  return { st, org, subId, end, customer };
}
/** Notification de Stripe, telle que la reçoit le serveur. */
const notification = (
  customer: string,
  id: string,
  organizationId: string,
  status: string,
  periodEnd: Date,
  trialEnd: Date | null = null,
) =>
  ({
    id,
    status,
    customer,
    metadata: { organizationId },
    items: {
      data: [
        {
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(periodEnd.getTime() / 1000),
          price: { recurring: { interval: "month" } },
        },
      ],
    },
    trial_end: trialEnd ? Math.floor(trialEnd.getTime() / 1000) : null,
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: status === "canceled" ? Math.floor(Date.now() / 1000) : null,
  }) as unknown as Parameters<typeof syncSubscription>[0];

describe("back-office : offre et jours Pro d'une organisation abonnée chez Stripe (RG-ADM-02)", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("Partenaire : refusé sans demande explicite ; avec la résiliation demandée, l'abonnement Stripe est résilié et sa notification de fin ne réécrit plus l'offre", async () => {
    const { st, org, subId, customer } = await setup();
    await expect(assignPlan(st, org.id, "partner", null)).rejects.toThrow(
      "PLAN_MANAGED_BY_STRIPE",
    );
    await assignPlan(st, org.id, "partner", null, { resilierStripe: true });
    expect(calls).toEqual([{ method: "cancel", args: [subId] }]);
    let sub = await db.subscription.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    expect([sub.planId, sub.status, sub.stripeSubscriptionId]).toEqual([
      "partner",
      "ACTIVE",
      null,
    ]);
    // la notification « abonnement résilié » arrive ensuite : avant la correction, elle remettait l'offre en « pro »
    expect(
      await syncSubscription(
        notification(customer, subId, org.id, "canceled", new Date()),
      ),
    ).toBe(false);
    sub = await db.subscription.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    expect([sub.planId, sub.status]).toEqual(["partner", "ACTIVE"]);
    // un nouvel abonnement souscrit plus tard est bien pris en compte
    expect(
      await syncSubscription(
        notification(
          customer,
          `sub_${rid()}`,
          org.id,
          "active",
          new Date(Date.now() + 30 * DAY),
        ),
      ),
    ).toBe(true);
    expect(
      (
        await db.subscription.findUniqueOrThrow({
          where: { organizationId: org.id },
        })
      ).planId,
    ).toBe("pro");
  });

  it("jours Pro offerts : prolongés chez Stripe, et toujours là après la notification de Stripe (rechargement de la fiche)", async () => {
    const { st, org, subId, customer } = await setup();
    await extendTrial(st, org.id, 30);
    const until = calls[0]?.args[1] as { trial_end: number };
    expect(calls[0]?.method).toBe("update");
    expect(calls[0]?.args[0]).toBe(subId);
    const fin = new Date(until.trial_end * 1000);
    expect(fin.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    let sub = await db.subscription.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    expect(sub.trialEndsAt?.getTime()).toBe(fin.getTime());
    // Stripe confirme : essai jusqu'à la nouvelle date ; la fiche relit la base, la prolongation est toujours là
    await syncSubscription(
      notification(customer, subId, org.id, "trialing", fin, fin),
    );
    sub = await db.subscription.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    expect([
      sub.status,
      sub.trialEndsAt?.getTime(),
      sub.currentPeriodEnd?.getTime(),
    ]).toEqual(["TRIALING", fin.getTime(), fin.getTime()]);
  });

  it("sans abonnement Stripe : les jours offerts sont gérés par Evoly et restent après rechargement", async () => {
    const { st } = await setup();
    const org = await db.organization.create({
      data: {
        name: "Salle",
        slug: `salle-${rid()}`,
        subdomain: `salle-${rid()}`,
        country: "BE",
        currency: "EUR",
      },
    });
    await extendTrial(st, org.id, 14);
    expect(calls).toEqual([]);
    const sub = await db.subscription.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    expect([sub.planId, sub.status]).toEqual(["pro", "TRIALING"]);
    expect(sub.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * DAY);
  });
});
