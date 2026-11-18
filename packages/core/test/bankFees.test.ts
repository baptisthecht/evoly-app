import { describe, expect, it } from "vitest";
import {
  estimateBankFee,
  EUR_TERMS,
  organizerNet,
  ticketCommission,
} from "../src";

describe("frais bancaires estimés (grille de Mollie) et net de l'organisateur (annexe C)", () => {
  it("carte européenne standard : 1,8 % + 0,25 €", () => {
    expect(estimateBankFee(3000)).toBe(79);
    expect(estimateBankFee(3000, "card_eea_standard")).toBe(79);
  });
  it("moyens locaux à prix fixe", () => {
    expect(estimateBankFee(3000, "bancontact")).toBe(39);
    expect(estimateBankFee(3000, "ideal_wero")).toBe(32);
  });
  it("cartes premium et internationales", () => {
    expect(estimateBankFee(3000, "card_eea_premium")).toBe(112); // 25 + 87
    expect(estimateBankFee(3000, "card_international")).toBe(123); // 25 + 97,5 → 123
  });
  it("paiement nul : aucun frais", () => {
    expect(estimateBankFee(0)).toBe(0);
  });
  it("billet à 30 €, Free : 28,32 € par carte, 28,72 € par Bancontact", () => {
    const c = ticketCommission(3000, EUR_TERMS.free);
    expect(organizerNet(3000, c, estimateBankFee(3000))).toBe(2832); // 30 € − 0,89 € − 0,79 €
    expect(organizerNet(3000, c, estimateBankFee(3000, "bancontact"))).toBe(
      2872,
    ); // 30 € − 0,89 € − 0,39 €
  });
});
