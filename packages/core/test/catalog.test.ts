import { describe, expect, it } from "vitest";
import { canDeleteTicketType, canEditBasePrice, canEditTierPrice, canSetQuantity, checkTicketPrice, publicationBlockers } from "../src";

describe("règles du catalogue", () => {
  it("prix minimum d'un billet payant (RG-TKT-01)", () => {
    expect(checkTicketPrice(0, "EUR")).toBe("OK");
    expect(checkTicketPrice(99, "EUR")).toBe("BELOW_MINIMUM");
    expect(checkTicketPrice(100, "EUR")).toBe("OK");
    expect(checkTicketPrice(-1, "EUR")).toBe("NEGATIVE");
    expect(checkTicketPrice(1.5, "EUR")).toBe("NOT_INTEGER");
    expect(checkTicketPrice(150, "XXX")).toBe("OK");
  });
  it("prix figé après la première vente (RG-TKT-05)", () => {
    expect(canEditBasePrice({ quantitySold: 0 })).toBe(true);
    expect(canEditBasePrice({ quantitySold: 1 })).toBe(false);
    expect(canEditBasePrice({ quantitySold: 0, priceLockedAt: new Date() })).toBe(false);
  });
  it("quantité jamais sous le vendu et le réservé", () => {
    expect(canSetQuantity(null, { quantitySold: 10, quantityHeld: 2 })).toBe(true);
    expect(canSetQuantity(11, { quantitySold: 10, quantityHeld: 2 })).toBe(false);
    expect(canSetQuantity(12, { quantitySold: 10, quantityHeld: 2 })).toBe(true);
  });
  it("suppression et paliers", () => {
    expect(canDeleteTicketType({ quantitySold: 0, quantityHeld: 0 })).toBe(true);
    expect(canDeleteTicketType({ quantitySold: 0, quantityHeld: 1 })).toBe(false);
    expect(canEditTierPrice({ quantitySold: 0 })).toBe(true);
    expect(canEditTierPrice({ quantitySold: 3 })).toBe(false);
  });
  it("conditions de publication (RG-EVT-02)", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const later = new Date("2026-11-14T20:00:00Z");
    expect(publicationBlockers({ activeTicketTypes: 1, hasPaidTicketTypes: true, stripeChargesEnabled: true, startsAt: later, now })).toEqual([]);
    expect(publicationBlockers({ activeTicketTypes: 0, hasPaidTicketTypes: true, stripeChargesEnabled: false, startsAt: now, now })).toEqual(["NO_TICKET_TYPE", "STRIPE_REQUIRED", "IN_THE_PAST"]);
    expect(publicationBlockers({ activeTicketTypes: 2, hasPaidTicketTypes: false, stripeChargesEnabled: false, startsAt: later, now })).toEqual([]);
  });
});
