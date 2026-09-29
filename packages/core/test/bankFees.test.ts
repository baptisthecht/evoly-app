import { describe, expect, it } from "vitest";
import { estimateBankFee, EUR_TERMS, organizerNet, ticketCommission } from "../src";

describe("frais bancaires estimés et net de l'organisateur (annexe C)", () => {
  it("carte européenne standard : 1,5 % + 0,25 €", () => {
    expect(estimateBankFee(3000)).toBe(70);
    expect(estimateBankFee(3000, "card_eea_standard")).toBe(70);
  });
  it("moyens locaux à prix fixe", () => {
    expect(estimateBankFee(3000, "bancontact")).toBe(35);
    expect(estimateBankFee(3000, "ideal_wero")).toBe(29);
  });
  it("cartes premium et internationales", () => {
    expect(estimateBankFee(3000, "card_eea_premium")).toBe(109); // 25 + 84
    expect(estimateBankFee(3000, "card_international")).toBe(120); // 25 + 94,5 → 120
  });
  it("paiement nul : aucun frais", () => {
    expect(estimateBankFee(0)).toBe(0);
  });
  it("billet à 30 €, Free : 28,70 € par carte, 29,05 € par Bancontact", () => {
    const c = ticketCommission(3000, EUR_TERMS.free);
    expect(organizerNet(3000, c, estimateBankFee(3000))).toBe(2870);
    expect(organizerNet(3000, c, estimateBankFee(3000, "bancontact"))).toBe(2905);
  });
});
