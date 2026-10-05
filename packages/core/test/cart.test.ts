import { describe, expect, it } from "vitest";
import {
  availableFor,
  checkCart,
  EUR_TERMS,
  meetsMinimumCharge,
  priceOrder,
  remaining,
  type EventForSale,
  type PromoInput,
  type TicketTypeForSale,
} from "../src";

const now = new Date("2026-10-20T12:00:00Z");
const event: EventForSale = {
  id: "e1",
  status: "PUBLISHED",
  capacity: 900,
  soldTotal: 0,
  heldTotal: 0,
  maxTicketsPerOrder: 10,
  startsAt: new Date("2026-11-14T20:00:00Z"),
};
const fosse: TicketTypeForSale = {
  id: "fosse",
  name: "Fosse",
  priceMinor: 2400,
  status: "ACTIVE",
  visibility: "VISIBLE",
  minPerOrder: 1,
  maxPerOrder: 6,
  quantity: 600,
  quantitySold: 0,
  quantityHeld: 0,
  tiers: [],
};
const vip: TicketTypeForSale = { ...fosse, id: "vip", name: "VIP", priceMinor: 4500, quantity: 50 };
const invite: TicketTypeForSale = { ...fosse, id: "inv", name: "Invitation", priceMinor: 0, quantity: null };

describe("stocks (RG-TKT-03)", () => {
  it("restant et disponibilité dans la jauge", () => {
    expect(remaining({ quantity: 10, quantitySold: 4, quantityHeld: 3 })).toBe(3);
    expect(remaining({ quantity: null, quantitySold: 4, quantityHeld: 3 })).toBe(Number.POSITIVE_INFINITY);
    expect(availableFor({ quantity: null, quantitySold: 0, quantityHeld: 0 }, { capacity: 100, soldTotal: 90, heldTotal: 5 })).toBe(5);
    expect(availableFor({ quantity: 3, quantitySold: 0, quantityHeld: 0 }, { capacity: null, soldTotal: 0, heldTotal: 0 })).toBe(3);
  });
});

describe("contrôle du panier", () => {
  it("panier valide", () => expect(checkCart(event, [fosse, vip], [{ ticketTypeId: "fosse", quantity: 2 }], now)).toEqual([]));
  it("événement hors vente", () => {
    expect(checkCart({ ...event, status: "DRAFT" }, [fosse], [{ ticketTypeId: "fosse", quantity: 1 }], now)).toEqual([{ code: "EVENT_NOT_ON_SALE" }]);
    expect(checkCart({ ...event, salesStartAt: new Date("2026-10-21T00:00:00Z") }, [fosse], [{ ticketTypeId: "fosse", quantity: 1 }], now)).toEqual([
      { code: "EVENT_SALES_NOT_STARTED" },
    ]);
    expect(checkCart({ ...event, startsAt: new Date("2026-10-20T11:00:00Z") }, [fosse], [{ ticketTypeId: "fosse", quantity: 1 }], now)).toEqual([
      { code: "EVENT_SALES_ENDED" },
    ]);
  });
  it("panier vide ou quantités invalides", () => {
    expect(checkCart(event, [fosse], [], now)).toEqual([{ code: "EMPTY_CART" }]);
    expect(checkCart(event, [fosse], [{ ticketTypeId: "fosse", quantity: 0 }], now)).toEqual([{ code: "INVALID_QUANTITY", ticketTypeId: "fosse" }]);
    expect(checkCart(event, [fosse], [{ ticketTypeId: "fosse", quantity: 1.5 }], now)[0]?.code).toBe("INVALID_QUANTITY");
  });
  it("tarif inconnu, masqué, en pause, réservé aux codes", () => {
    expect(checkCart(event, [fosse], [{ ticketTypeId: "x", quantity: 1 }], now)).toEqual([{ code: "UNKNOWN_TICKET_TYPE", ticketTypeId: "x" }]);
    expect(checkCart(event, [{ ...fosse, visibility: "HIDDEN" }], [{ ticketTypeId: "fosse", quantity: 1 }], now)[0]?.code).toBe("TICKET_TYPE_UNAVAILABLE");
    expect(checkCart(event, [{ ...fosse, status: "PAUSED" }], [{ ticketTypeId: "fosse", quantity: 1 }], now)[0]?.code).toBe("TICKET_TYPE_UNAVAILABLE");
    const codeOnly = { ...fosse, visibility: "CODE_ONLY" as const };
    expect(checkCart(event, [codeOnly], [{ ticketTypeId: "fosse", quantity: 1 }], now)[0]?.code).toBe("TICKET_TYPE_UNAVAILABLE");
    expect(checkCart(event, [codeOnly], [{ ticketTypeId: "fosse", quantity: 1 }], now, { unlocksHidden: true })).toEqual([]);
  });
  it("fenêtre de vente d'un tarif", () => {
    expect(checkCart(event, [{ ...fosse, salesStartAt: new Date("2026-10-21T00:00:00Z") }], [{ ticketTypeId: "fosse", quantity: 1 }], now)[0]?.code).toBe(
      "SALES_NOT_STARTED",
    );
    expect(checkCart(event, [{ ...fosse, salesEndAt: new Date("2026-10-20T00:00:00Z") }], [{ ticketTypeId: "fosse", quantity: 1 }], now)[0]?.code).toBe(
      "SALES_ENDED",
    );
  });
  it("minimum, maximum et limite de commande", () => {
    expect(checkCart(event, [{ ...fosse, minPerOrder: 2 }], [{ ticketTypeId: "fosse", quantity: 1 }], now)).toContainEqual({
      code: "BELOW_MIN",
      ticketTypeId: "fosse",
      min: 2,
    });
    expect(checkCart(event, [fosse], [{ ticketTypeId: "fosse", quantity: 7 }], now)).toContainEqual({ code: "ABOVE_MAX", ticketTypeId: "fosse", max: 6 });
    const errors = checkCart(
      { ...event, maxTicketsPerOrder: 4 },
      [fosse, vip],
      [
        { ticketTypeId: "fosse", quantity: 3 },
        { ticketTypeId: "vip", quantity: 2 },
      ],
      now,
    );
    expect(errors).toContainEqual({ code: "ORDER_LIMIT", max: 4 });
  });
  it("lignes en double fusionnées", () => {
    expect(
      checkCart(
        event,
        [fosse],
        [
          { ticketTypeId: "fosse", quantity: 4 },
          { ticketTypeId: "fosse", quantity: 3 },
        ],
        now,
      ),
    ).toContainEqual({ code: "ABOVE_MAX", ticketTypeId: "fosse", max: 6 });
  });
  it("stock et jauge", () => {
    expect(checkCart(event, [{ ...vip, quantitySold: 49 }], [{ ticketTypeId: "vip", quantity: 2 }], now)).toContainEqual({
      code: "NOT_ENOUGH_STOCK",
      ticketTypeId: "vip",
      available: 1,
    });
    expect(checkCart({ ...event, soldTotal: 898, heldTotal: 1 }, [fosse], [{ ticketTypeId: "fosse", quantity: 2 }], now)).toContainEqual({
      code: "EVENT_FULL",
      available: 1,
    });
  });
});

describe("chiffrage d'une commande (RG-BUY-03)", () => {
  it("deux fosses et un VIP, Free", () => {
    const o = priceOrder(
      [fosse, vip],
      [
        { ticketTypeId: "fosse", quantity: 2 },
        { ticketTypeId: "vip", quantity: 1 },
      ],
      EUR_TERMS.free,
      now,
    );
    expect(o.subtotalMinor).toBe(9300);
    expect(o.totalMinor).toBe(9300);
    expect(o.applicationFeeMinor).toBe(2 * 77 + 119); // 29 + 48 = 77 ; 29 + 90 = 119
    expect(o.ticketCount).toBe(3);
    expect(o.isFree).toBe(false);
    expect(o.feeSnapshot.capMinor).toBe(250);
  });
  it("remise de 50 % sur 30 €, commission sur le prix payé", () => {
    const t = { ...fosse, priceMinor: 3000 };
    const promo: PromoInput = {
      id: "p",
      eventId: "e1",
      code: "MOITIE",
      discountType: "PERCENT",
      percentOffBps: 5000,
      ticketTypeIds: [],
      usedCount: 0,
      isActive: true,
    };
    const o = priceOrder([t], [{ ticketTypeId: "fosse", quantity: 1 }], EUR_TERMS.free, now, { promo });
    expect(o.discountMinor).toBe(1500);
    expect(o.totalMinor).toBe(1500);
    expect(o.applicationFeeMinor).toBe(59); // 29 + 2 % de 15 €
  });
  it("code limité à un tarif", () => {
    const promo: PromoInput = {
      id: "p",
      eventId: "e1",
      code: "VIP10",
      discountType: "AMOUNT",
      amountOffMinor: 1000,
      ticketTypeIds: ["vip"],
      usedCount: 0,
      isActive: true,
    };
    const o = priceOrder(
      [fosse, vip],
      [
        { ticketTypeId: "fosse", quantity: 1 },
        { ticketTypeId: "vip", quantity: 1 },
      ],
      EUR_TERMS.pro,
      now,
      { promo },
    );
    expect(o.discountMinor).toBe(1000);
    expect(o.lines.find((l) => l.ticketTypeId === "vip")?.unitPaidMinor).toBe(3500);
  });
  it("commande gratuite : aucune commission", () => {
    const o = priceOrder([invite], [{ ticketTypeId: "inv", quantity: 3 }], EUR_TERMS.free, now);
    expect(o.isFree).toBe(true);
    expect(o.applicationFeeMinor).toBe(0);
  });
  it("gratuité par code promo", () => {
    const promo: PromoInput = { id: "p", eventId: "e1", code: "STAFF", discountType: "FREE", ticketTypeIds: [], usedCount: 0, isActive: true };
    const o = priceOrder([fosse], [{ ticketTypeId: "fosse", quantity: 2 }], EUR_TERMS.free, now, { promo });
    expect(o.totalMinor).toBe(0);
    expect(o.applicationFeeMinor).toBe(0);
  });
  it("paliers : une ligne par palier", () => {
    const withTiers = { ...fosse, tiers: [{ id: "pre", priceMinor: 1800, quantityLimit: 100, quantitySold: 99, quantityHeld: 0, sortOrder: 0 }] };
    const o = priceOrder([withTiers], [{ ticketTypeId: "fosse", quantity: 2 }], EUR_TERMS.free, now);
    expect(o.lines.map((l) => [l.tierId, l.quantity, l.unitPriceMinor])).toEqual([
      ["pre", 1, 1800],
      [null, 1, 2400],
    ]);
    expect(o.totalMinor).toBe(4200);
  });
  it("tarif inconnu", () => {
    expect(() => priceOrder([fosse], [{ ticketTypeId: "x", quantity: 1 }], EUR_TERMS.free, now)).toThrow();
  });
  it("minimum de paiement Stripe (RG-BUY-05)", () => {
    expect(meetsMinimumCharge(0, "EUR")).toBe(true);
    expect(meetsMinimumCharge(49, "EUR")).toBe(false);
    expect(meetsMinimumCharge(50, "EUR")).toBe(true);
    expect(meetsMinimumCharge(49, "XXX")).toBe(false);
  });
});
