import { describe, expect, it } from "vitest";
import { applyBps, assertNonNegative, capThresholdMinor, EUR_TERMS, feeSnapshot, normalizeCurrency, sum, ticketCommission } from "../src";

const free = EUR_TERMS.free;
const pro = EUR_TERMS.pro;

describe("commission (RG-FEE-01 à 03, annexe C)", () => {
  it.each([
    // 0,29 € + 2 %, arrondi ; plafond 2,50 € en Free et 1 € en Pro (grille d'octobre 2026)
    [100, 31, 31],
    [500, 39, 39],
    [1000, 49, 49],
    [2000, 69, 69],
    [3000, 89, 89],
    [3600, 101, 100],
    [3700, 103, 100],
    [5000, 129, 100],
    [5700, 143, 100],
    [10000, 229, 100],
    [12000, 250, 100],
  ])("billet à %i centimes : Free %i, Pro %i", (price, expectedFree, expectedPro) => {
    expect(ticketCommission(price, free)).toBe(expectedFree);
    expect(ticketCommission(price, pro)).toBe(expectedPro);
  });

  it("billet gratuit : aucune commission", () => {
    expect(ticketCommission(0, free)).toBe(0);
    expect(ticketCommission(0, pro)).toBe(0);
  });

  it("arrondi au plus proche, 0,5 vers le haut", () => {
    expect(ticketCommission(1525, free)).toBe(60); // 29 + 30,5
    expect(ticketCommission(1524, free)).toBe(59); // 29 + 30,48
  });

  it("refuse les montants non entiers ou négatifs", () => {
    expect(() => ticketCommission(10.5, free)).toThrow();
    expect(() => ticketCommission(-1, free)).toThrow();
    expect(() => assertNonNegative(-5)).toThrow();
  });

  it("plafond atteint dès 35,25 € en Pro et 110,25 € en Free (commission arrondie)", () => {
    expect(capThresholdMinor(pro)).toBe(3525);
    expect(ticketCommission(3524, pro)).toBe(99);
    expect(ticketCommission(3525, pro)).toBe(100);
    expect(capThresholdMinor(free)).toBe(11025);
    expect(ticketCommission(11024, free)).toBe(249);
    expect(ticketCommission(11025, free)).toBe(250);
  });

  it("plafond inférieur ou égal à la part fixe", () => {
    expect(capThresholdMinor({ ...free, capMinor: 15 })).toBe(1);
  });

  it("instantané des conditions (RG-FEE-04)", () => {
    expect(feeSnapshot(pro)).toEqual({ planId: "pro", currency: "EUR", fixedMinor: 29, rateBps: 200, capMinor: 100 });
  });
});

describe("outils monétaires", () => {
  it("applyBps calcule en entiers", () => {
    expect(applyBps(333, 150)).toBe(5); // 4,995 → 5
    expect(applyBps(1000, 0, 35)).toBe(35);
    expect(() => applyBps(1.2, 150)).toThrow();
  });
  it("sum et devises", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(normalizeCurrency(" eur ")).toBe("EUR");
    expect(() => normalizeCurrency("euro")).toThrow();
  });
});

describe("saisie des prix", () => {
  it("formats acceptés", async () => {
    const { parseMajorToMinor, minorToInput } = await import("../src");
    expect(parseMajorToMinor("24")).toBe(2400);
    expect(parseMajorToMinor("24,5")).toBe(2450);
    expect(parseMajorToMinor(" 24.50 € ")).toBe(2450);
    expect(parseMajorToMinor("1 234,56")).toBe(123456);
    expect(parseMajorToMinor("0")).toBe(0);
    expect(parseMajorToMinor("1500", 0)).toBe(1500);
    expect(minorToInput(2450)).toBe("24,50");
    expect(minorToInput(2400)).toBe("24");
    expect(minorToInput(2405, 2, ".")).toBe("24.05");
  });
  it("saisies refusées", async () => {
    const { parseMajorToMinor } = await import("../src");
    for (const bad of ["", "-5", "24,555", "abc", "24,", "1e3", "12.345.678"]) expect(parseMajorToMinor(bad)).toBeNull();
  });
});
