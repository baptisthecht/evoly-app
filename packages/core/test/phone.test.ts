import { describe, expect, it } from "vitest";
import { toE164 } from "../src/phone";

describe("numéro de téléphone au format international (profil Mollie)", () => {
  it("numéro national : indicatif du pays de l'organisation, sans le 0 de tête", () => {
    expect(toE164("0470 12 34 56", "BE")).toBe("+32470123456");
    expect(toE164("04/70.12.34.56", "be")).toBe("+32470123456");
    expect(toE164("06 12 34 56 78", "FR")).toBe("+33612345678");
    expect(toE164("020-820 2070", "NL")).toBe("+31208202070");
    expect(toE164("612 345 678", "ES")).toBe("+34612345678");
  });

  it("Italie : le 0 des fixes fait partie du numéro", () => {
    expect(toE164("06 1234 5678", "IT")).toBe("+390612345678");
    expect(toE164("347 123 4567", "IT")).toBe("+393471234567");
  });

  it("déjà international, avec + ou 00 : gardé tel quel, quel que soit le pays", () => {
    expect(toE164("+32 470 12 34 56", "FR")).toBe("+32470123456");
    expect(toE164("0033 6 12 34 56 78", "BE")).toBe("+33612345678");
    expect(toE164("(+44) 20 7946 0958", "BE")).toBe("+442079460958");
  });

  it("illisible : lettres, trop court, trop long, pays inconnu pour un numéro national", () => {
    expect(toE164("", "BE")).toBeNull();
    expect(toE164("appelez-moi", "BE")).toBeNull();
    expect(toE164("0470 12", "BE")).toBeNull();
    expect(toE164("+3247012345678901234", "BE")).toBeNull();
    expect(toE164("+0470123456", "BE")).toBeNull();
    expect(toE164("0470123456", "US")).toBeNull();
  });
});
