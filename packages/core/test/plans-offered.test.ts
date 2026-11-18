import { describe, expect, it } from "vitest";
import { effectivePlan, type SubscriptionInput } from "../src/plans";

// champs absents complétés
const sub = (
  s: Partial<SubscriptionInput> & Pick<SubscriptionInput, "planId" | "status">,
): SubscriptionInput => ({
  currentPeriodEnd: null,
  pastDueSince: null,
  trialEndsAt: null,
  ...s,
});

const now = new Date("2026-10-18T12:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");

describe("offre réellement appliquée : dates tenues par Evoly", () => {
  it("essai offert : Pro jusqu'à sa fin, puis Free ; offre datée : jusqu'à sa date ; sans limite : toujours", () => {
    expect(
      effectivePlan(
        sub({
          planId: "pro",
          status: "TRIALING",
          trialEndsAt: future,
        }),
        now,
      ),
    ).toBe("pro");
    expect(
      effectivePlan(
        sub({
          planId: "pro",
          status: "TRIALING",
          trialEndsAt: past,
        }),
        now,
      ),
    ).toBe("free");
    expect(
      effectivePlan(
        sub({
          planId: "pro",
          status: "TRIALING",
          trialEndsAt: null,
        }),
        now,
      ),
    ).toBe("pro");
    expect(
      effectivePlan(
        sub({
          planId: "partner",
          status: "ACTIVE",
          currentPeriodEnd: future,
        }),
        now,
      ),
    ).toBe("partner");
    expect(
      effectivePlan(
        sub({
          planId: "partner",
          status: "ACTIVE",
          currentPeriodEnd: past,
        }),
        now,
      ),
    ).toBe("free");
    expect(
      effectivePlan(
        sub({
          planId: "pro",
          status: "ACTIVE",
          currentPeriodEnd: null,
        }),
        now,
      ),
    ).toBe("pro");
  });
});
