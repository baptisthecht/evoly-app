import { describe, expect, it } from "vitest";
import { effectivePlan } from "../src/plans";

const now = new Date("2026-10-18T12:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");

describe("offre réellement appliquée : offres attribuées par Evoly, sans Stripe", () => {
  it("essai offert : Pro jusqu'à sa fin, puis Free ; offre datée : jusqu'à sa date ; sans limite : toujours ; avec Stripe, c'est Stripe qui y met fin", () => {
    expect(effectivePlan({ planId: "pro", status: "TRIALING", trialEndsAt: future, stripeSubscriptionId: null }, now)).toBe("pro");
    expect(effectivePlan({ planId: "pro", status: "TRIALING", trialEndsAt: past, stripeSubscriptionId: null }, now)).toBe("free");
    expect(effectivePlan({ planId: "pro", status: "TRIALING", trialEndsAt: null, stripeSubscriptionId: null }, now)).toBe("pro");
    expect(effectivePlan({ planId: "partner", status: "ACTIVE", currentPeriodEnd: future, stripeSubscriptionId: null }, now)).toBe("partner");
    expect(effectivePlan({ planId: "partner", status: "ACTIVE", currentPeriodEnd: past, stripeSubscriptionId: null }, now)).toBe("free");
    expect(effectivePlan({ planId: "pro", status: "ACTIVE", currentPeriodEnd: null, stripeSubscriptionId: null }, now)).toBe("pro");
    expect(effectivePlan({ planId: "pro", status: "TRIALING", trialEndsAt: past, stripeSubscriptionId: "sub_1" }, now)).toBe("pro");
    expect(effectivePlan({ planId: "pro", status: "ACTIVE", currentPeriodEnd: past, stripeSubscriptionId: "sub_1" }, now)).toBe("pro");
    expect(effectivePlan({ planId: "pro", status: "TRIALING", trialEndsAt: past }, now)).toBe("pro"); // champ non lu : comportement d'avant
  });
});
