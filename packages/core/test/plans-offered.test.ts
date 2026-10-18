import { describe, expect, it } from "vitest";
import { effectivePlan, type SubscriptionInput } from "../src/plans";

// champs absents complétés ; par défaut un abonnement Stripe, dont Stripe gère lui-même les dates
const sub = (s: Partial<SubscriptionInput> & Pick<SubscriptionInput, "planId" | "status">): SubscriptionInput => ({
  currentPeriodEnd: null,
  pastDueSince: null,
  trialEndsAt: null,
  stripeSubscriptionId: "sub_stripe",
  ...s,
});

const now = new Date("2026-10-18T12:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");

describe("offre réellement appliquée : offres attribuées par Evoly, sans Stripe", () => {
  it("essai offert : Pro jusqu'à sa fin, puis Free ; offre datée : jusqu'à sa date ; sans limite : toujours ; avec Stripe, c'est Stripe qui y met fin", () => {
    expect(effectivePlan(sub({ planId: "pro", status: "TRIALING", trialEndsAt: future, stripeSubscriptionId: null }), now)).toBe("pro");
    expect(effectivePlan(sub({ planId: "pro", status: "TRIALING", trialEndsAt: past, stripeSubscriptionId: null }), now)).toBe("free");
    expect(effectivePlan(sub({ planId: "pro", status: "TRIALING", trialEndsAt: null, stripeSubscriptionId: null }), now)).toBe("pro");
    expect(effectivePlan(sub({ planId: "partner", status: "ACTIVE", currentPeriodEnd: future, stripeSubscriptionId: null }), now)).toBe("partner");
    expect(effectivePlan(sub({ planId: "partner", status: "ACTIVE", currentPeriodEnd: past, stripeSubscriptionId: null }), now)).toBe("free");
    expect(effectivePlan(sub({ planId: "pro", status: "ACTIVE", currentPeriodEnd: null, stripeSubscriptionId: null }), now)).toBe("pro");
    expect(effectivePlan(sub({ planId: "pro", status: "TRIALING", trialEndsAt: past, stripeSubscriptionId: "sub_1" }), now)).toBe("pro");
    expect(effectivePlan(sub({ planId: "pro", status: "ACTIVE", currentPeriodEnd: past, stripeSubscriptionId: "sub_1" }), now)).toBe("pro");
    expect(effectivePlan(sub({ planId: "pro", status: "TRIALING", trialEndsAt: past }), now)).toBe("pro"); // abonnement Stripe : Stripe met lui-même fin à l'essai
  });
});
