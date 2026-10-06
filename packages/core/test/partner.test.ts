import { describe, expect, it } from "vitest";
import { EUR_TERMS, effectivePlan, ticketCommission } from "../src";

describe("offre Partenaire (Pro offert par Evoly, sans commission)", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("mêmes règles de période que Pro : active, ou résiliée jusqu'à sa date de fin", () => {
    expect(effectivePlan({ planId: "partner", status: "ACTIVE" } as never, now)).toBe("partner");
    expect(effectivePlan({ planId: "partner", status: "CANCELED", currentPeriodEnd: new Date(now.getTime() + 86_400_000) } as never, now)).toBe("partner");
    expect(effectivePlan({ planId: "partner", status: "CANCELED", currentPeriodEnd: new Date(now.getTime() - 1_000) } as never, now)).toBe("free");
    expect(effectivePlan({ planId: "pro", status: "ACTIVE" } as never, now)).toBe("pro");
  });
  it("aucune commission Evoly, quel que soit le prix du billet", () => {
    for (const price of [100, 500, 2_400, 15_000, 100_000]) expect(ticketCommission(price, EUR_TERMS.partner)).toBe(0);
    expect(ticketCommission(2_400, EUR_TERMS.free)).toBeGreaterThan(0);
  });
});
