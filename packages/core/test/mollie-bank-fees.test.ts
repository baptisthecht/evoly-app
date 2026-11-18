import { describe, expect, it } from "vitest";
import {
  MOLLIE_REFUND_FEE_MINOR,
  estimateBankFee,
  resaleBankFee,
} from "../src/bankFees";
import { originalPaymentRefundable } from "../src/resale";

describe("frais bancaires de Mollie (docs/MOLLIE.md)", () => {
  it("grille Mollie : cartes 1,8 % + 0,25 €, Bancontact 0,39 €, iDEAL 0,32 € ; carte européenne par défaut", () => {
    expect(estimateBankFee(2000, "card_eea_standard")).toBe(61);
    expect(estimateBankFee(2000, "bancontact")).toBe(39);
    expect(estimateBankFee(2000, "ideal_wero")).toBe(32);
    expect(estimateBankFee(2000)).toBe(61);
    expect(estimateBankFee(0, "bancontact")).toBe(0);
  });

  it("revente : frais du paiement de l'acheteur, plus ceux du remboursement quand le vendeur avait payé en ligne (RG-FEE-51)", () => {
    expect(resaleBankFee(2000, true)).toBe(61 + MOLLIE_REFUND_FEE_MINOR);
    expect(resaleBankFee(2000, false)).toBe(61);
    expect(resaleBankFee(2000, true, 40)).toBe(40 + MOLLIE_REFUND_FEE_MINOR);
    expect(resaleBankFee(0, true)).toBe(0);
  });

  it("revente : un paiement d'origine par carte cadeau ou bon ne se rembourse pas ; Bancontact, oui", () => {
    const now = new Date();
    const order = {
      totalMinor: 2000,
      refundedMinor: 0,
      paidAt: now,
      status: "PAID",
    };
    for (const method of ["giftcard", "voucher", "paysafecard"])
      expect(
        originalPaymentRefundable(
          { ...order, paymentMethodType: method },
          2000,
          now,
        ),
      ).toBe(false);
    expect(
      originalPaymentRefundable(
        { ...order, paymentMethodType: "bancontact" },
        2000,
        now,
      ),
    ).toBe(true);
  });
});

describe("estimations affichées avec la grille de Mollie (docs/MOLLIE.md)", () => {
  it("aide au prix et totaux des finances : grille Mollie", async () => {
    const { EUR_TERMS, netForGross, ticketCommission } =
      await import("../src/fees");
    const { financeTotals } = await import("../src/finance");
    const terms = EUR_TERMS.free;
    expect(netForGross(2000, terms)).toBe(
      2000 - ticketCommission(2000, terms) - estimateBankFee(2000),
    );
    const order = {
      eventId: "e",
      status: "PAID",
      totalMinor: 2000,
      refundedMinor: 0,
      applicationFeeMinor: 0,
      paymentFeeMinor: null,
      tickets: 1,
    };
    expect(financeTotals([order]).bankFeeMinor).toBe(61);
  });
});
