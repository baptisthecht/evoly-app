import { describe, expect, it } from "vitest";
import {
  MOLLIE_REFUND_FEE_MINOR,
  estimateBankFee,
  resaleBankFee,
} from "../src/bankFees";
import { originalPaymentRefundable } from "../src/resale";

describe("frais bancaires selon le prestataire (docs/MOLLIE.md)", () => {
  it("grille Mollie : cartes 1,8 % + 0,25 €, Bancontact 0,39 €, iDEAL 0,32 € ; la grille Stripe reste celle par défaut", () => {
    expect(estimateBankFee(2000, "card_eea_standard", "MOLLIE")).toBe(61);
    expect(estimateBankFee(2000, "bancontact", "MOLLIE")).toBe(39);
    expect(estimateBankFee(2000, "ideal_wero", "MOLLIE")).toBe(32);
    expect(estimateBankFee(2000)).toBe(55);
    expect(estimateBankFee(0, "bancontact", "MOLLIE")).toBe(0);
  });

  it("revente : frais du paiement de l'acheteur, plus ceux du remboursement quand le vendeur avait payé par Mollie (RG-FEE-51)", () => {
    expect(resaleBankFee(2000, { buyer: "MOLLIE", seller: "MOLLIE" })).toBe(
      61 + MOLLIE_REFUND_FEE_MINOR,
    );
    expect(resaleBankFee(2000, { buyer: "MOLLIE", seller: "STRIPE" })).toBe(61);
    expect(resaleBankFee(2000, { buyer: "MOLLIE", seller: "MOLLIE" }, 40)).toBe(
      40 + MOLLIE_REFUND_FEE_MINOR,
    );
    expect(resaleBankFee(2000, { buyer: "STRIPE", seller: null })).toBe(55);
    expect(resaleBankFee(0, { buyer: "MOLLIE", seller: "MOLLIE" })).toBe(0);
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
