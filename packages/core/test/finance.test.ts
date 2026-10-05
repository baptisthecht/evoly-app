import { describe, expect, it } from "vitest";
import { commissionVat, estimateBankFee, financeByEvent, financeTotals, statementNumber, vatIncluded } from "../src";

describe("finances (US-FIN-01)", () => {
  it("totaux : brut, remboursé, commission, frais réels ou estimés, net", () => {
    const t = financeTotals([
      { eventId: "a", status: "PAID", totalMinor: 4800, refundedMinor: 0, applicationFeeMinor: 102, paymentFeeMinor: 97, tickets: 2 },
      { eventId: "a", status: "PARTIALLY_REFUNDED", totalMinor: 2400, refundedMinor: 1200, applicationFeeMinor: 102, paymentFeeMinor: null, tickets: 2 },
      { eventId: "b", status: "PAID", totalMinor: 0, refundedMinor: 0, applicationFeeMinor: 0, paymentFeeMinor: null, tickets: 3 },
      { eventId: "b", status: "PENDING", totalMinor: 9900, refundedMinor: 0, applicationFeeMinor: 200, paymentFeeMinor: null, tickets: 1 },
    ]);
    expect(t).toMatchObject({ orders: 3, tickets: 7, grossMinor: 7200, refundedMinor: 1200, commissionMinor: 204, bankFeeEstimated: true });
    expect(t.bankFeeMinor).toBe(97 + estimateBankFee(2400));
    expect(t.netMinor).toBe(7200 - 1200 - 204 - t.bankFeeMinor);
  });
  it("revente neutre pour l'organisateur (RG-RSL-12)", () => {
    // acheteur : 2000 payés, commission 45, frais 55 ; vendeur remboursé 2000 − 45 − 55 = 1900 sur sa commande d'origine
    const buyer = { eventId: "a", status: "PAID", totalMinor: 2000, refundedMinor: 0, applicationFeeMinor: 45, paymentFeeMinor: 55, tickets: 1 };
    const sellerRefundOnly = {
      eventId: "a",
      status: "PARTIALLY_REFUNDED",
      totalMinor: 0,
      refundedMinor: 1900,
      applicationFeeMinor: 0,
      paymentFeeMinor: 0,
      tickets: 0,
    };
    expect(financeTotals([buyer, sellerRefundOnly]).netMinor).toBe(0);
  });
  it("regroupement par événement", () => {
    const m = financeByEvent([
      { eventId: "a", status: "PAID", totalMinor: 1000, refundedMinor: 0, applicationFeeMinor: 30, paymentFeeMinor: 40, tickets: 1 },
      { eventId: "b", status: "PAID", totalMinor: 2000, refundedMinor: 0, applicationFeeMinor: 45, paymentFeeMinor: 55, tickets: 1 },
    ]);
    expect(m.get("a")?.netMinor).toBe(930);
    expect(m.get("b")?.grossMinor).toBe(2000);
  });
});

describe("TVA sur la commission et relevés (RG-FEE-30)", () => {
  it("selon le pays et le statut d'assujetti", () => {
    expect(commissionVat({ country: "BE", vatRegistered: true, vatNumber: "BE0123456789" })).toEqual({ rateBps: 2100, mention: "BE_VAT" });
    expect(commissionVat({ country: "FR", vatRegistered: true, vatNumber: "FR12345678901" })).toEqual({ rateBps: 0, mention: "REVERSE_CHARGE" });
    expect(commissionVat({ country: "FR", vatRegistered: true, vatNumber: " " })).toEqual({ rateBps: 2000, mention: "OSS" });
    expect(commissionVat({ country: "NL", vatRegistered: false })).toEqual({ rateBps: 2100, mention: "OSS" });
    expect(commissionVat({ country: "CH", vatRegistered: true, vatNumber: "CHE-123" })).toEqual({ rateBps: 0, mention: "OUTSIDE_EU" });
  });
  it("TVA comprise, arrondie au centime ; numéros de relevé", () => {
    expect(vatIncluded(12100, 2100)).toBe(2100);
    expect(vatIncluded(612, 2100)).toBe(106);
    expect(vatIncluded(612, 0)).toBe(0);
    expect(statementNumber(2026, 42)).toBe("EVO-2026-000042");
  });
});
