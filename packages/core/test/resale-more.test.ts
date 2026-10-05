import { describe, expect, it } from "vitest";
import { groupListings, originalPaymentRefundable } from "../src";

const now = new Date("2026-10-10T12:00:00Z");
const paid = { totalMinor: 4800, refundedMinor: 0, paymentMethodType: "card", paidAt: new Date("2026-09-20T12:00:00Z"), status: "PAID" };

describe("revente : remboursabilité du paiement d'origine (RG-RSL-05)", () => {
  it("cas remboursables", () => {
    expect(originalPaymentRefundable(paid, 2400, now)).toBe(true);
    expect(originalPaymentRefundable({ ...paid, totalMinor: 0, paymentMethodType: null, paidAt: null }, 0, now)).toBe(true);
    expect(originalPaymentRefundable({ ...paid, status: "PARTIALLY_REFUNDED", refundedMinor: 2400 }, 2400, now)).toBe(true);
  });
  it("cas refusés", () => {
    expect(originalPaymentRefundable({ ...paid, paymentMethodType: "multibanco" }, 2400, now)).toBe(false);
    expect(originalPaymentRefundable({ ...paid, paidAt: new Date("2026-03-01T12:00:00Z") }, 2400, now)).toBe(false);
    expect(originalPaymentRefundable({ ...paid, status: "REFUNDED" }, 2400, now)).toBe(false);
    expect(originalPaymentRefundable({ ...paid, refundedMinor: 3000 }, 2400, now)).toBe(false);
  });
});

describe("section Revente de la page de vente (RG-PUB-04)", () => {
  it("regroupe par tarif, trie par prix puis ancienneté", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 1, 12, m));
    const groups = groupListings([
      { id: "a", ticketTypeId: "vip", ticketTypeName: "VIP", priceMinor: 4500, createdAt: at(1) },
      { id: "b", ticketTypeId: "fosse", ticketTypeName: "Fosse", priceMinor: 2400, createdAt: at(5) },
      { id: "c", ticketTypeId: "fosse", ticketTypeName: "Fosse", priceMinor: 2400, createdAt: at(2) },
      { id: "d", ticketTypeId: "fosse", ticketTypeName: "Fosse", priceMinor: 2000, createdAt: at(9) },
    ]);
    expect(groups.map((g) => [g.ticketTypeName, g.count, g.fromMinor])).toEqual([
      ["Fosse", 3, 2000],
      ["VIP", 1, 4500],
    ]);
    expect(groups[0]!.listings.map((l) => l.id)).toEqual(["d", "c", "b"]);
  });
});
