import { describe, expect, it } from "vitest";
import {
  formatVatRate,
  optionLineName,
  normalizePickupCode,
  shopOrderTotals,
  withdrawalOpen,
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
    expect([
      formatVatRate(550, "fr"),
      formatVatRate(550, "en"),
      formatVatRate(2100, "de"),
    ]).toEqual(["5,5", "5.5", "21"]);
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

describe("boutique : reçu, rétractation, code de retrait (RG-SHOP-10, RG-SHOP-11)", () => {
  it("totaux toutes taxes comprises et TVA de chaque taux, livraison à son taux", () => {
    const t = shopOrderTotals([
      { unitPriceMinor: 2500, quantity: 2, vatRateBps: 2100 },
      { unitPriceMinor: 1200, quantity: 1, vatRateBps: 600 },
      { unitPriceMinor: 990, quantity: 1, vatRateBps: 2100 },
      { unitPriceMinor: 500, quantity: 1, vatRateBps: 0 },
    ]);
    expect(t).toEqual({
      subtotalMinor: 7690,
      shippingMinor: 0,
      totalMinor: 7690,
      vatMinor: 1040 + 68,
      vat: [
        { rateBps: 2100, amountMinor: 5990, vatMinor: 1040 },
        { rateBps: 600, amountMinor: 1200, vatMinor: 68 },
      ],
    });
    const withShipping = shopOrderTotals(
      [{ unitPriceMinor: 2500, quantity: 1, vatRateBps: 2100 }],
      { amountMinor: 490, vatRateBps: 2100 },
    );
    expect(withShipping).toMatchObject({
      subtotalMinor: 2500,
      shippingMinor: 490,
      totalMinor: 2990,
      vat: [{ rateBps: 2100, amountMinor: 2990, vatMinor: 519 }],
    });
    expect(
      shopOrderTotals([], { amountMinor: 0, vatRateBps: 2100 }).vat,
    ).toEqual([]);
  });

  it("rétractation : avant la réception, puis 14 jours ; jamais sur une commande non payée ou remboursée", () => {
    const now = new Date("2026-12-01T12:00:00Z");
    const paid = {
      status: "PAID",
      totalMinor: 2500,
      refundedMinor: 0,
      receivedAt: null,
    };
    expect(withdrawalOpen(paid, now)).toBe(true);
    expect(
      withdrawalOpen(
        { ...paid, receivedAt: new Date("2026-11-18T13:00:00Z") },
        now,
      ),
    ).toBe(true);
    expect(
      withdrawalOpen(
        { ...paid, receivedAt: new Date("2026-11-17T11:00:00Z") },
        now,
      ),
    ).toBe(false);
    expect(withdrawalOpen({ ...paid, status: "PENDING" }, now)).toBe(false);
    expect(
      withdrawalOpen(
        { ...paid, status: "PARTIALLY_REFUNDED", refundedMinor: 1000 },
        now,
      ),
    ).toBe(true);
    expect(withdrawalOpen({ ...paid, refundedMinor: 2500 }, now)).toBe(false);
  });

  it("code de retrait saisi à la main : majuscules, sans espaces ni tirets", () => {
    expect(normalizePickupCode(" ab3d-ef 7h9k ")).toBe("AB3DEF7H9K");
  });
});

describe("boutique en option des événements (RG-SHOP-13)", () => {
  it("nom d'une option achetée : la variante entre parenthèses", () => {
    expect(optionLineName("T-shirt", "M")).toBe("T-shirt (M)");
    expect(optionLineName("Vestiaire", null)).toBe("Vestiaire");
  });
});
