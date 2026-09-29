import { describe, expect, it } from "vitest";
import { availabilityDisplay, daysUntil, effectiveEnd, isValidTimeZone, timeZoneOffsetMinutes, uniqueSlug, utcToZonedLocal, zonedLocalToUtc } from "../src";

describe("fuseaux horaires (RG-I18N-02)", () => {
  it("heure d'hiver et d'été à Bruxelles", () => {
    expect(zonedLocalToUtc("2026-11-14T20:00", "Europe/Brussels").toISOString()).toBe("2026-11-14T19:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-14T20:00", "Europe/Brussels").toISOString()).toBe("2026-07-14T18:00:00.000Z");
    expect(timeZoneOffsetMinutes(new Date("2026-07-14T18:00:00Z"), "Europe/Brussels")).toBe(120);
  });
  it("autres fuseaux", () => {
    expect(zonedLocalToUtc("2026-11-14T20:00", "Europe/Lisbon").toISOString()).toBe("2026-11-14T20:00:00.000Z");
    expect(zonedLocalToUtc("2026-11-14T20:00", "America/New_York").toISOString()).toBe("2026-11-15T01:00:00.000Z");
    expect(zonedLocalToUtc("2026-11-14T20:00", "Asia/Kolkata").toISOString()).toBe("2026-11-14T14:30:00.000Z");
  });
  it("aller-retour avec l'affichage du champ", () => {
    for (const local of ["2026-01-01T00:00", "2026-03-29T01:59", "2026-10-25T04:00", "2026-12-31T23:59"]) {
      expect(utcToZonedLocal(zonedLocalToUtc(local, "Europe/Brussels"), "Europe/Brussels")).toBe(local);
    }
  });
  it("heure inexistante au passage à l'heure d'été : après le saut", () => {
    const d = zonedLocalToUtc("2026-03-29T02:30", "Europe/Brussels");
    expect(d.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(utcToZonedLocal(d, "Europe/Brussels")).toBe("2026-03-29T03:30");
  });
  it("heure ambiguë au passage à l'heure d'hiver : la première", () => {
    expect(zonedLocalToUtc("2026-10-25T02:30", "Europe/Brussels").toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });
  it("saisies invalides", () => {
    expect(() => zonedLocalToUtc("2026-02-30T20:00", "Europe/Brussels")).toThrow();
    expect(() => zonedLocalToUtc("14/11/2026 20:00", "Europe/Brussels")).toThrow();
    expect(() => zonedLocalToUtc("2026-13-01T20:00", "Europe/Brussels")).toThrow();
    expect(isValidTimeZone("Europe/Brussels")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
  it("fin effective : début + 6 heures à défaut (RG-EVT-06)", () => {
    const start = new Date("2026-11-14T19:00:00Z");
    expect(effectiveEnd(start).toISOString()).toBe("2026-11-15T01:00:00.000Z");
    expect(effectiveEnd(start, new Date("2026-11-14T23:00:00Z")).toISOString()).toBe("2026-11-14T23:00:00.000Z");
  });
});

describe("affichage public", () => {
  it("disponibilité (RG-PUB-02)", () => {
    expect(availabilityDisplay(0, 100)).toEqual({ kind: "SOLD_OUT" });
    expect(availabilityDisplay(10, 100)).toEqual({ kind: "FEW_LEFT", remaining: 10 });
    expect(availabilityDisplay(11, 100)).toEqual({ kind: "AVAILABLE" });
    expect(availabilityDisplay(20, 1000)).toEqual({ kind: "FEW_LEFT", remaining: 20 });
    expect(availabilityDisplay(21, 1000)).toEqual({ kind: "AVAILABLE" });
    expect(availabilityDisplay(1, 5)).toEqual({ kind: "FEW_LEFT", remaining: 1 });
    expect(availabilityDisplay(Number.POSITIVE_INFINITY, null)).toEqual({ kind: "AVAILABLE" });
    expect(availabilityDisplay(3, null)).toEqual({ kind: "FEW_LEFT", remaining: 3 });
  });
  it("identifiants d'URL uniques", () => {
    expect(uniqueSlug("concert", new Set())).toBe("concert");
    expect(uniqueSlug("concert", new Set(["concert", "concert-2"]))).toBe("concert-3");
    expect(uniqueSlug("", new Set())).toBe("evenement");
  });
  it("compte à rebours sous 30 jours", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(daysUntil(new Date("2026-10-30T12:00:00Z"), now)).toBe(10);
    expect(daysUntil(new Date("2026-12-30T12:00:00Z"), now)).toBeNull();
    expect(daysUntil(new Date("2026-10-19T12:00:00Z"), now)).toBeNull();
  });
});
