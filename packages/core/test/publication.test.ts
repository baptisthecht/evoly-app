import { describe, expect, it } from "vitest";
import { isPrepublished, salesOpeningAt } from "../src";

describe("publication programmée (RG-PRG-01, RG-PRG-02)", () => {
  const now = new Date("2026-10-09T10:00:00Z");
  const earlier = new Date("2026-10-01T08:00:00Z");
  const later = new Date("2026-10-12T08:00:00Z");

  it("sans date, l'événement est publié ; avec une date, il l'est à la seconde près", () => {
    expect(isPrepublished({ publishAt: null }, now)).toBe(false);
    expect(isPrepublished({ publishAt: later }, now)).toBe(true);
    expect(isPrepublished({ publishAt: later }, later)).toBe(false);
  });

  it("les ventes ouvrent à la plus tardive des deux dates", () => {
    expect(salesOpeningAt({ publishAt: null, salesStartAt: null })).toBeNull();
    expect(salesOpeningAt({ publishAt: later, salesStartAt: null })).toEqual(later);
    expect(salesOpeningAt({ publishAt: null, salesStartAt: earlier })).toEqual(earlier);
    expect(salesOpeningAt({ publishAt: later, salesStartAt: earlier })).toEqual(later);
    expect(salesOpeningAt({ publishAt: earlier, salesStartAt: later })).toEqual(later);
  });
});
