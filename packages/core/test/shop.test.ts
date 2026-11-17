import { describe, expect, it } from "vitest";
import {
  cleanNames,
  combinationCount,
  combinations,
  parseVatRate,
  productSaleBlocker,
  variantAvailable,
  variantKey,
  variantPrice,
  vatRateInput,
} from "../src/shop";

describe("boutique : options, variantes, TVA (RG-SHOP-02, RG-SHOP-03, RG-SHOP-04)", () => {
  it("clé d'une combinaison : indépendante de l'ordre des options", () => {
    expect(variantKey(["b", "a"])).toBe("a.b");
    expect(variantKey([])).toBe("");
  });

  it("combinaisons : produit cartésien dans l'ordre des options, options vides ignorées, sans option : variante unique", () => {
    const taille = {
      id: "g1",
      name: "Taille",
      values: [
        { id: "s", name: "S" },
        { id: "m", name: "M" },
      ],
    };
    const couleur = {
      id: "g2",
      name: "Couleur",
      values: [
        { id: "noir", name: "Noir" },
        { id: "blanc", name: "Blanc" },
      ],
    };
    expect(combinations([taille, couleur])).toEqual([
      { key: "noir.s", valueIds: ["s", "noir"], label: "S · Noir" },
      { key: "blanc.s", valueIds: ["s", "blanc"], label: "S · Blanc" },
      { key: "m.noir", valueIds: ["m", "noir"], label: "M · Noir" },
      { key: "blanc.m", valueIds: ["m", "blanc"], label: "M · Blanc" },
    ]);
    expect(
      combinations([taille, { id: "g3", name: "Vide", values: [] }]),
    ).toHaveLength(2);
    expect(combinations([])).toEqual([{ key: "", valueIds: [], label: "" }]);
    expect(combinationCount([3, 4, 0])).toBe(12);
    expect(combinationCount([])).toBe(1);
  });

  it("noms : espaces nettoyés, vides écartés, doublons signalés (casse ignorée)", () => {
    expect(cleanNames(["  M ", "", "L", "XL"])).toEqual({
      names: ["M", "L", "XL"],
      duplicate: false,
    });
    expect(cleanNames(["Noir", "noir"])).toEqual({
      names: ["Noir"],
      duplicate: true,
    });
    expect(cleanNames(["Très   grand"], 5).names).toEqual(["Très "]);
  });

  it("TVA : saisie en pour cent, deux décimales au plus, de 0 à 30 %", () => {
    expect(parseVatRate("21")).toBe(2100);
    expect(parseVatRate("5,5")).toBe(550);
    expect(parseVatRate(" 5.5 % ")).toBe(550);
    expect(parseVatRate("0")).toBe(0);
    expect(parseVatRate("2,1")).toBe(210);
    expect(parseVatRate("31")).toBeNull();
    expect(parseVatRate("5,555")).toBeNull();
    expect(parseVatRate("-6")).toBeNull();
    expect(parseVatRate("")).toBeNull();
    expect(vatRateInput(2100)).toBe("21");
    expect(vatRateInput(550)).toBe("5,5");
  });

  it("prix et disponibilité d'une variante", () => {
    expect(variantPrice(2500, 300)).toBe(2800);
    expect(variantAvailable({ stock: null, held: 4 })).toBeNull();
    expect(variantAvailable({ stock: 10, held: 3 })).toBe(7);
    expect(variantAvailable({ stock: 2, held: 3 })).toBe(0);
  });

  it("mise en vente : une variante active et un mode de remise", () => {
    expect(
      productSaleBlocker({
        activeVariants: 0,
        pickupEnabled: true,
        shippingEnabled: false,
      }),
    ).toBe("NO_VARIANT");
    expect(
      productSaleBlocker({
        activeVariants: 2,
        pickupEnabled: false,
        shippingEnabled: false,
      }),
    ).toBe("NO_FULFILLMENT");
    expect(
      productSaleBlocker({
        activeVariants: 1,
        pickupEnabled: false,
        shippingEnabled: true,
      }),
    ).toBeNull();
  });
});
