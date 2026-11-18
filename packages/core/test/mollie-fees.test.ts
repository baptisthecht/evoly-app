import { describe, expect, it } from "vitest";
import { mollieApplicationFee } from "../src/fees";

describe("commission transmise à Mollie (frais d'application)", () => {
  it("telle quelle sous le plafond de Mollie (montant moins 0,35 et 6 %)", () => {
    expect(mollieApplicationFee(2000, 120)).toBe(120);
    expect(mollieApplicationFee(1000, 905)).toBe(905);
  });

  it("ramenée au plafond sur une très petite commande ; jamais négative, nulle si elle l'est", () => {
    expect(mollieApplicationFee(1000, 950)).toBe(905);
    expect(mollieApplicationFee(50, 20)).toBe(12);
    expect(mollieApplicationFee(30, 10)).toBe(0);
    expect(mollieApplicationFee(2000, 0)).toBe(0);
  });
});
