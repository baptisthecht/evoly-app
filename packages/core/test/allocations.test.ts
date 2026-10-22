import { describe, expect, it } from "vitest";
import { availableFor, canDeleteTicketType, canSetQuantity, checkCart, remaining } from "../src";

// règle unique des places en vente (docs/COMPATIBILITE_RESEAUX.md) : places confiées aux réseaux retirées de la vente en ligne
const event = {
  id: "e1",
  status: "PUBLISHED" as const,
  capacity: null as number | null,
  soldTotal: 0,
  heldTotal: 0,
  allocatedTotal: 0,
  maxTicketsPerOrder: 10,
  startsAt: new Date("2031-01-01T20:00:00Z"),
};
const type = (o: Record<string, unknown> = {}) => ({
  id: "t1",
  name: "Fosse",
  priceMinor: 2_000,
  status: "ACTIVE" as const,
  visibility: "VISIBLE" as const,
  minPerOrder: 1,
  maxPerOrder: 10,
  tiers: [],
  quantity: 100 as number | null,
  quantitySold: 20,
  quantityHeld: 5,
  quantityAllocated: 30,
  ...o,
});
const now = new Date("2030-06-01T10:00:00Z");

describe("places en vente : contingents des réseaux", () => {
  it("tarif : quantité − vendues − en cours de paiement − confiées ; sans contingent, inchangé", () => {
    expect(remaining(type())).toBe(45);
    expect(remaining(type({ quantityAllocated: undefined }))).toBe(75);
    expect(remaining(type({ quantity: null }))).toBe(Number.POSITIVE_INFINITY);
  });

  it("jauge : les places confiées comptent, même sur un tarif illimité", () => {
    const unlimited = type({ quantity: null, quantitySold: 0, quantityHeld: 0, quantityAllocated: 0 });
    expect(availableFor(unlimited, { capacity: 50, soldTotal: 10, heldTotal: 2, allocatedTotal: 30 })).toBe(8);
    expect(availableFor(unlimited, { capacity: 50, soldTotal: 10, heldTotal: 2 })).toBe(38);
  });

  it("panier : refusé au-delà des places en ligne, par le tarif comme par la jauge", () => {
    const big = { ...event, maxTicketsPerOrder: 100 }; // grande commande : seule la limite des places compte ici
    const many = type({ maxPerOrder: 100 });
    expect(checkCart(big, [many], [{ ticketTypeId: "t1", quantity: 46 }], now)).toContainEqual(
      expect.objectContaining({ code: "NOT_ENOUGH_STOCK", available: 45 }),
    );
    expect(checkCart(big, [many], [{ ticketTypeId: "t1", quantity: 45 }], now)).toEqual([]);
    const full = { ...event, capacity: 60, soldTotal: 20, heldTotal: 5, allocatedTotal: 30 };
    expect(checkCart(full, [type()], [{ ticketTypeId: "t1", quantity: 6 }], now)).toContainEqual(expect.objectContaining({ code: "EVENT_FULL", available: 5 }));
  });

  it("catalogue : quantité jamais sous les places confiées ; tarif confié à un réseau impossible à supprimer", () => {
    expect(canSetQuantity(54, type())).toBe(false);
    expect(canSetQuantity(55, type())).toBe(true);
    expect(canDeleteTicketType({ quantitySold: 0, quantityHeld: 0, quantityAllocated: 4 })).toBe(false);
    expect(canDeleteTicketType({ quantitySold: 0, quantityHeld: 0, quantityAllocated: 0 })).toBe(true);
  });
});
