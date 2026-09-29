import { describe, expect, it } from "vitest";
import { daysBeforeDowngrade, effectivePlan, subscriptionStatusFromStripe, trialEligible, yearlySavings } from "../src";

describe("abonnement Pro (section 3.5)", () => {
  it("statuts Stripe", () => {
    expect(subscriptionStatusFromStripe("trialing")).toBe("TRIALING");
    expect(subscriptionStatusFromStripe("active")).toBe("ACTIVE");
    expect(subscriptionStatusFromStripe("past_due")).toBe("PAST_DUE");
    expect(subscriptionStatusFromStripe("unpaid")).toBe("UNPAID");
    expect(subscriptionStatusFromStripe("incomplete")).toBe("INCOMPLETE");
    expect(subscriptionStatusFromStripe("incomplete_expired")).toBe("CANCELED");
    expect(subscriptionStatusFromStripe("canceled")).toBe("CANCELED");
  });
  it("un seul essai par organisation (RG-SUB-02)", () => {
    expect(trialEligible(null)).toBe(true);
    expect(trialEligible({ trialEndsAt: null, stripeSubscriptionId: null })).toBe(true);
    expect(trialEligible({ trialEndsAt: new Date(), stripeSubscriptionId: null })).toBe(false);
    expect(trialEligible({ trialEndsAt: null, stripeSubscriptionId: "sub_1" })).toBe(false);
  });
  it("impayé : 7 jours avant la rétrogradation (RG-SUB-06)", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(daysBeforeDowngrade({ status: "PAST_DUE", pastDueSince: new Date("2026-10-08T12:00:00Z") }, now)).toBe(5);
    expect(daysBeforeDowngrade({ status: "PAST_DUE", pastDueSince: new Date("2026-09-30T12:00:00Z") }, now)).toBe(0);
    expect(daysBeforeDowngrade({ status: "ACTIVE", pastDueSince: null }, now)).toBeNull();
    const sub = { planId: "pro" as const, status: "PAST_DUE" as const, currentPeriodEnd: null };
    expect(effectivePlan({ ...sub, pastDueSince: new Date("2026-10-08T12:00:00Z") }, now)).toBe("pro");
    expect(effectivePlan({ ...sub, pastDueSince: new Date("2026-10-01T12:00:00Z") }, now)).toBe("free");
  });
  it("résiliation : Pro jusqu'à la fin de la période payée (RG-SUB-04)", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(effectivePlan({ planId: "pro", status: "CANCELED", currentPeriodEnd: new Date("2026-10-20T00:00:00Z"), pastDueSince: null }, now)).toBe("pro");
    expect(effectivePlan({ planId: "pro", status: "CANCELED", currentPeriodEnd: new Date("2026-10-01T00:00:00Z"), pastDueSince: null }, now)).toBe("free");
  });
  it("offre annuelle : 24,65 € par mois, −15 %", () => {
    expect(yearlySavings(2900, 29580)).toEqual({ perMonthMinor: 2465, savingBps: 1500 });
  });
});
