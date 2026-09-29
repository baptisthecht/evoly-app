import { describe, expect, it } from "vitest";
import { applyBps, assertNonNegative, capThresholdMinor, EUR_TERMS, feeSnapshot, normalizeCurrency, sum, ticketCommission } from "../src";

const free = EUR_TERMS.free;
const pro = EUR_TERMS.pro;

describe("commission (RG-FEE-01 à 03, annexe C)", () => {
  it.each([
    [100, 17, 17],
    [500, 23, 23],
    [1000, 30, 30],
    [2000, 45, 45],
    [3000, 60, 60],
    [3600, 69, 69],
    [3700, 71, 70],
    [5000, 90, 70],
    [5700, 100, 70],
    [10000, 100, 70],
  ])("billet à %i centimes : Free %i, Pro %i", (price, expectedFree, expectedPro) => {
    expect(ticketCommission(price, free)).toBe(expectedFree);
    expect(ticketCommission(price, pro)).toBe(expectedPro);
  });

  it("billet gratuit : aucune commission", () => {
    expect(ticketCommission(0, free)).toBe(0);
    expect(ticketCommission(0, pro)).toBe(0);
  });

  it("arrondi au plus proche, 0,5 vers le haut", () => {
    expect(ticketCommission(1500, free)).toBe(38); // 15 + 22,5
    expect(ticketCommission(1499, free)).toBe(37); // 15 + 22,485
  });

  it("refuse les montants non entiers ou négatifs", () => {
    expect(() => ticketCommission(10.5, free)).toThrow();
    expect(() => ticketCommission(-1, free)).toThrow();
    expect(() => assertNonNegative(-5)).toThrow();
  });

  it("plafond atteint dès 36,34 € en Pro et 56,34 € en Free (commission arrondie)", () => {
    expect(capThresholdMinor(pro)).toBe(3634);
    expect(ticketCommission(3633, pro)).toBe(69);
    expect(ticketCommission(3634, pro)).toBe(70);
    expect(capThresholdMinor(free)).toBe(5634);
    expect(ticketCommission(5633, free)).toBe(99);
    expect(ticketCommission(5634, free)).toBe(100);
  });

  it("plafond inférieur ou égal à la part fixe", () => {
    expect(capThresholdMinor({ ...free, capMinor: 15 })).toBe(1);
  });

  it("instantané des conditions (RG-FEE-04)", () => {
    expect(feeSnapshot(pro)).toEqual({ planId: "pro", currency: "EUR", fixedMinor: 15, rateBps: 150, capMinor: 70 });
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
