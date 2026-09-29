import { describe, expect, it } from "vitest";
import { checkResalePrice, EUR_TERMS, estimateBankFee, resaleAmounts, resaleBlockers, resaleCutoff, type ResaleEligibilityInput } from "../src";

const base: ResaleEligibilityInput = {
  eventStatus: "PUBLISHED", eventResaleEnabled: true, ticketTypeResaleAllowed: true,
  eventStartsAt: new Date("2026-11-14T20:00:00Z"), resaleCutoffMinutes: 120, ticketStatus: "VALID",
  hasOpenListing: false, originalPaymentRefundable: true, now: new Date("2026-11-14T17:00:00Z"),
};

describe("éligibilité à la revente (RG-RSL-01 à 05)", () => {
  it("billet revendable", () => expect(resaleBlockers(base)).toEqual([]));
  it("fin de la revente 2 heures avant le début", () => {
    expect(resaleCutoff(base.eventStartsAt, 120).toISOString()).toBe("2026-11-14T18:00:00.000Z");
    expect(resaleBlockers({ ...base, now: new Date("2026-11-14T18:00:00Z") })).toEqual(["CUTOFF_PASSED"]);
  });
  it("tous les motifs de refus", () => {
    expect(resaleBlockers({
      ...base, eventResaleEnabled: false, ticketTypeResaleAllowed: false, eventStatus: "CANCELLED",
      ticketStatus: "CHECKED_IN", hasOpenListing: true, originalPaymentRefundable: false,
    })).toEqual(["EVENT_RESALE_DISABLED", "TICKET_TYPE_RESALE_DISABLED", "EVENT_NOT_ON_SALE", "TICKET_NOT_VALID", "ALREADY_LISTED", "PAYMENT_NOT_REFUNDABLE"]);
  });
  it("ventes en pause : revente toujours possible", () => expect(resaleBlockers({ ...base, eventStatus: "SALES_PAUSED" })).toEqual([]));
});

describe("prix de revente (RG-RSL-02)", () => {
  it("jamais au-dessus de la valeur faciale", () => {
    expect(checkResalePrice(3000, 3000)).toBe("OK");
    expect(checkResalePrice(2500, 3000)).toBe("OK");
    expect(checkResalePrice(3001, 3000)).toBe("ABOVE_FACE_VALUE");
    expect(checkResalePrice(-1, 3000)).toBe("NEGATIVE");
    expect(checkResalePrice(10.5, 3000)).toBe("NOT_INTEGER");
  });
});

describe("montants d'une revente (RG-FEE-50 à 52, annexe C)", () => {
  it("revente 30 € par carte, Free : le vendeur récupère 28,70 €", () => {
    expect(resaleAmounts(3000, EUR_TERMS.free, estimateBankFee(3000))).toEqual({ buyerPaysMinor: 3000, commissionMinor: 60, bankFeeMinor: 70, sellerRefundMinor: 2870 });
  });
  it("revente à 0 € : simple transfert", () => {
    expect(resaleAmounts(0, EUR_TERMS.free, 0)).toEqual({ buyerPaysMinor: 0, commissionMinor: 0, bankFeeMinor: 0, sellerRefundMinor: 0 });
  });
  it("jamais de montant négatif pour le vendeur", () => {
    expect(resaleAmounts(100, EUR_TERMS.free, 200).sellerRefundMinor).toBe(0);
  });
});
