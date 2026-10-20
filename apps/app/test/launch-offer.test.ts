import { effectivePlan } from "@evoly/core";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createOrganization } from "@/server/onboarding";
import { PLAN_SUBSCRIPTION_SELECT } from "@/server/planSelect";

const rid = () => Math.random().toString(36).slice(2, 10);
const create = async () => {
  const u = await db.user.create({ data: { name: "Nora", email: `offre.${rid()}@exemple.be`, emailVerified: true } });
  return createOrganization(u.id, { name: "Club", subdomain: `club-${rid()}`, country: "BE", type: "ASSOCIATION" } as never);
};
const subOf = (organizationId: string) => db.subscription.findUniqueOrThrow({ where: { organizationId }, select: PLAN_SUBSCRIPTION_SELECT });
afterEach(() => {
  process.env.LAUNCH_OFFER_UNTIL = "off";
});

describe("offre de lancement à la création d'une organisation", () => {
  it("offre en cours : Pro pendant 3 mois, sans Stripe, puis Free tout seul", async () => {
    process.env.LAUNCH_OFFER_UNTIL = new Date(Date.now() + 86_400_000).toISOString();
    const org = await create();
    const sub = await subOf(org.id);
    expect([sub.planId, sub.status, sub.stripeSubscriptionId]).toEqual(["pro", "ACTIVE", null]);
    const months = (sub.currentPeriodEnd!.getTime() - Date.now()) / (30.4 * 86_400_000);
    expect(months).toBeGreaterThan(2.9);
    expect(months).toBeLessThan(3.1);
    expect(effectivePlan(sub, new Date())).toBe("pro");
    expect(effectivePlan(sub, new Date(sub.currentPeriodEnd!.getTime() + 1_000))).toBe("free");
  });

  it("offre terminée ou désactivée : Free", async () => {
    process.env.LAUNCH_OFFER_UNTIL = new Date(Date.now() - 86_400_000).toISOString();
    expect((await subOf((await create()).id)).planId).toBe("free");
    process.env.LAUNCH_OFFER_UNTIL = "off";
    expect((await subOf((await create()).id)).planId).toBe("free");
  });
});
