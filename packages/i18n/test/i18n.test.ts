import { describe, expect, it } from "vitest";
import { currencyExponent, flattenKeys, formatBps, formatDate, formatDateTime, formatMoney, formatTime, fromMinor, isLocale, MESSAGES, negotiateLocale, timeZoneLabel } from "../src";

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("langues", () => {
  it("négociation depuis Accept-Language", () => {
    expect(negotiateLocale("en-US,en;q=0.9,fr;q=0.8")).toBe("en");
    expect(negotiateLocale("nl-BE,nl;q=0.9,fr;q=0.7")).toBe("fr");
    expect(negotiateLocale("de-DE")).toBe("fr");
    expect(negotiateLocale("de-DE", null, "en")).toBe("en");
    expect(negotiateLocale("fr;q=0.2,en;q=0.9")).toBe("en");
    expect(negotiateLocale("en;q=0, fr")).toBe("fr");
    expect(negotiateLocale(null)).toBe("fr");
    expect(negotiateLocale("en", "fr")).toBe("fr");
    expect(isLocale("nl")).toBe(false);
  });
});

describe("formats", () => {
  it("montants", () => {
    expect(nbsp(formatMoney(2400, "EUR", "fr"))).toBe("24,00 €");
    expect(nbsp(formatMoney(2400, "EUR", "fr", { trimZeroCents: true }))).toBe("24 €");
    expect(nbsp(formatMoney(2451, "EUR", "fr", { trimZeroCents: true }))).toBe("24,51 €");
    expect(formatMoney(2400, "EUR", "en")).toBe("€24.00");
    expect(formatMoney(1500, "GBP", "en")).toBe("£15.00");
    expect(nbsp(formatMoney(29580, "EUR", "fr"))).toBe("295,80 €");
  });
  it("devises sans décimales", () => {
    expect(currencyExponent("JPY")).toBe(0);
    expect(fromMinor(1500, "JPY")).toBe(1500);
    expect(fromMinor(1500, "EUR")).toBe(15);
  });
  it("taux", () => {
    expect(nbsp(formatBps(150, "fr"))).toBe("1,5 %");
    expect(formatBps(150, "en")).toBe("1.5%");
  });
  it("dates dans le fuseau de l'événement", () => {
    const d = new Date("2026-11-14T20:00:00Z");
    expect(formatTime(d, "Europe/Brussels", "fr")).toBe("21:00");
    expect(formatDate(d, "Europe/Brussels", "fr")).toBe("14 novembre 2026");
    expect(formatDateTime(d, "Europe/Brussels", "fr")).toContain("samedi 14 novembre 2026");
    expect(formatDateTime(d, "Europe/London", "en", "short")).toContain("20:00");
    expect(timeZoneLabel(d, "Europe/Brussels", "en")).toBe("GMT+1");
  });
});

describe("messages", () => {
  it("toutes les clés existent dans les deux langues", () => {
    const fr = flattenKeys(MESSAGES.fr).sort();
    const en = flattenKeys(MESSAGES.en).sort();
    expect(en).toEqual(fr);
    expect(fr.length).toBeGreaterThan(150);
  });
  it("aucun message vide", () => {
    const values = (o: unknown): string[] => (typeof o === "string" ? [o] : Object.values(o as object).flatMap(values));
    for (const locale of ["fr", "en"] as const) for (const v of values(MESSAGES[locale])) expect(v.trim()).not.toBe("");
  });
});
