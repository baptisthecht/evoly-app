import { describe, expect, it } from "vitest";
import { allocateTiers, effectivePrice, isTierActive, nextTier, tierCalendarIssues, tierRemaining, type PriceTierInput } from "../src";

const d = (s: string) => new Date(s);
const tier = (p: Partial<PriceTierInput> & { id: string; priceMinor: number }): PriceTierInput => ({ quantitySold: 0, quantityHeld: 0, sortOrder: 0, ...p });

const presale = tier({ id: "pre", priceMinor: 1800, quantityLimit: 100, quantitySold: 100, sortOrder: 0 });
const normal = tier({ id: "normal", priceMinor: 2400, endsAt: d("2026-11-01T00:00:00Z"), sortOrder: 1 });
const dayOf = tier({ id: "dayof", priceMinor: 3000, startsAt: d("2026-11-14T00:00:00Z"), sortOrder: 2 });

describe("prix effectif (RG-TKT-07)", () => {
  it("prévente épuisée, période normale en cours : prix normal", () => {
    expect(effectivePrice(2000, [presale, normal, dayOf], d("2026-10-20T12:00:00Z"))).toEqual({ priceMinor: 2400, tierId: "normal" });
  });
  it("aucun palier applicable : prix de base", () => {
    expect(effectivePrice(2000, [presale, normal, dayOf], d("2026-11-05T12:00:00Z"))).toEqual({ priceMinor: 2000, tierId: null });
  });
  it("palier jour J", () => {
    expect(effectivePrice(2000, [presale, normal, dayOf], d("2026-11-14T10:00:00Z")).tierId).toBe("dayof");
  });
  it("prix dynamiques désactivés : prix de base", () => {
    expect(effectivePrice(2000, [normal], d("2026-10-20T12:00:00Z"), false)).toEqual({ priceMinor: 2000, tierId: null });
  });
  it("l'ordre des paliers compte, pas l'ordre du tableau", () => {
    const a = tier({ id: "a", priceMinor: 1000, sortOrder: 2 });
    const b = tier({ id: "b", priceMinor: 900, sortOrder: 1 });
    expect(effectivePrice(2000, [a, b], d("2026-10-20T12:00:00Z")).tierId).toBe("b");
  });
  it("les places réservées comptent dans le quota", () => {
    const t = tier({ id: "t", priceMinor: 1000, quantityLimit: 10, quantitySold: 8, quantityHeld: 2 });
    expect(isTierActive(t, d("2026-10-20T12:00:00Z"))).toBe(false);
    expect(tierRemaining(t)).toBe(0);
    expect(tierRemaining(tier({ id: "u", priceMinor: 1 }))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("répartition d'une commande entre paliers", () => {
  it("2 places en prévente, 1 au palier suivant", () => {
    const pre = tier({ id: "pre", priceMinor: 1800, quantityLimit: 100, quantitySold: 98, sortOrder: 0 });
    expect(allocateTiers(2000, [pre, normal], d("2026-10-20T12:00:00Z"), 3)).toEqual([
      { tierId: "pre", priceMinor: 1800, quantity: 2 },
      { tierId: "normal", priceMinor: 2400, quantity: 1 },
    ]);
  });
  it("au-delà des paliers : prix de base", () => {
    const pre = tier({ id: "pre", priceMinor: 1800, quantityLimit: 100, quantitySold: 99 });
    expect(allocateTiers(2000, [pre], d("2026-10-20T12:00:00Z"), 3)).toEqual([
      { tierId: "pre", priceMinor: 1800, quantity: 1 },
      { tierId: null, priceMinor: 2000, quantity: 2 },
    ]);
  });
  it("prix dynamiques désactivés", () => {
    expect(allocateTiers(2000, [normal], d("2026-10-20T12:00:00Z"), 2, false)).toEqual([{ tierId: null, priceMinor: 2000, quantity: 2 }]);
  });
});

describe("prochain palier et calendrier", () => {
  it("prochain palier à venir", () => {
    expect(nextTier([presale, normal, dayOf], d("2026-10-20T12:00:00Z"))?.id).toBe("dayof");
    expect(nextTier([presale, normal], d("2026-10-20T12:00:00Z"))).toBeNull();
  });
  it("détecte trous et chevauchements", () => {
    const t1 = tier({ id: "1", priceMinor: 1, startsAt: d("2026-10-01T00:00:00Z"), endsAt: d("2026-10-10T00:00:00Z") });
    const t2 = tier({ id: "2", priceMinor: 1, startsAt: d("2026-10-12T00:00:00Z"), endsAt: d("2026-10-20T00:00:00Z") });
    const t3 = tier({ id: "3", priceMinor: 1, startsAt: d("2026-10-18T00:00:00Z"), endsAt: d("2026-10-30T00:00:00Z") });
    const issues = tierCalendarIssues([t3, t1, t2]);
    expect(issues.map((i) => i.kind)).toEqual(["GAP", "OVERLAP"]);
    expect(tierCalendarIssues([t1])).toEqual([]);
  });
});
