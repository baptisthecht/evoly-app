import { describe, expect, it } from "vitest";
import { ratePercent, riskSignals } from "../src";

describe("signaux de risque (section 9.24)", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const base = { createdAt: new Date("2025-01-01T00:00:00Z"), maxTicketPriceMinor: 2500, paidOrders: 100, disputes: 0, refundedOrders: 2 };
  it("aucun signal pour une organisation ordinaire", () => expect(riskSignals(base, now)).toEqual([]));
  it("nouvelle organisation avec un billet cher", () => {
    expect(riskSignals({ ...base, createdAt: new Date("2026-10-01T00:00:00Z"), maxTicketPriceMinor: 15_000 }, now)).toEqual(["NEW_ORG_HIGH_PRICE"]);
    expect(riskSignals({ ...base, maxTicketPriceMinor: 30_000 }, now)).toEqual([]);
  });
  it("litiges et remboursements anormaux", () => {
    expect(riskSignals({ ...base, disputes: 3 }, now)).toEqual(["HIGH_DISPUTE_RATE"]);
    expect(riskSignals({ ...base, paidOrders: 200, disputes: 3 }, now)).toEqual(["HIGH_DISPUTE_RATE"]);
    expect(riskSignals({ ...base, refundedOrders: 25 }, now)).toEqual(["MANY_REFUNDS"]);
    expect(riskSignals({ ...base, paidOrders: 10, refundedOrders: 5 }, now)).toEqual([]);
  });
  it("taux en pour cent", () => {
    expect(ratePercent(1, 3)).toBe(33.3);
    expect(ratePercent(0, 0)).toBe(0);
  });
});
