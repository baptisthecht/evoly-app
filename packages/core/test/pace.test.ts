import { describe, expect, it } from "vitest";
import { PACE_TOLERANCE, salesPace, salesWindow } from "../src";

const day = 86_400_000;
const start = new Date("2026-10-01T10:00:00Z");
const end = new Date(start.getTime() + 100 * day);
const at = (d: number) => new Date(start.getTime() + d * day);
const base = { capacity: 400, salesStart: start, salesEnd: end };

describe("rythme des ventes (refonte A3)", () => {
  it("en avance : plus vendu que de temps passé, avec la date projetée du complet", () => {
    const r = salesPace({ ...base, sold: 312, now: at(69) });
    expect(r.pace).toBe("ahead");
    expect(r.soldRatio).toBeCloseTo(0.78);
    expect(r.elapsedRatio).toBeCloseTo(0.69);
    // 312 places en 69 jours : les 88 restantes en 69 × 88 / 312 jours
    expect(r.soldOutAt!.getTime()).toBeCloseTo(
      at(69 + (69 * 88) / 312).getTime(),
      -3,
    );
  });

  it("dans le rythme : écart sous la tolérance, dans les deux sens", () => {
    expect(salesPace({ ...base, sold: 168, now: at(44) }).pace).toBe("onTrack");
    expect(salesPace({ ...base, sold: 184, now: at(44) }).pace).toBe("onTrack");
    expect(PACE_TOLERANCE).toBe(0.05);
  });

  it("un peu lent : moins vendu que de temps passé, sans complet projeté avant la fin", () => {
    const r = salesPace({ ...base, capacity: 250, sold: 128, now: at(62) });
    expect(r.pace).toBe("behind");
    expect(r.soldOutAt).toBeNull();
  });

  it("trop tôt pour juger : jamais « un peu lent » dans les premiers jours", () => {
    expect(salesPace({ ...base, sold: 0, now: at(9) }).pace).toBe("onTrack");
    expect(salesPace({ ...base, sold: 0, now: at(10) }).pace).toBe("behind");
  });

  it("complet, pas commencé, illimité, période vide", () => {
    expect(salesPace({ ...base, sold: 400, now: at(50) })).toMatchObject({
      pace: "soldOut",
      soldRatio: 1,
    });
    expect(salesPace({ ...base, sold: 0, now: at(-3) })).toMatchObject({
      pace: "notStarted",
      elapsedRatio: 0,
    });
    expect(
      salesPace({ ...base, capacity: null, sold: 12, now: at(5) }),
    ).toMatchObject({ pace: "unknown", soldRatio: null });
    expect(salesPace({ ...base, capacity: 0, sold: 0, now: at(5) }).pace).toBe(
      "unknown",
    );
    expect(
      salesPace({ ...base, salesEnd: start, sold: 3, now: at(5) }),
    ).toMatchObject({
      pace: "unknown",
      elapsedRatio: null,
      soldRatio: 3 / 400,
    });
  });

  it("après la fin des ventes, la période compte pour entière", () => {
    const r = salesPace({ ...base, sold: 200, now: at(120) });
    expect(r.elapsedRatio).toBe(1);
    expect(r.pace).toBe("behind");
  });

  it("période de vente : ouverture, sinon publication, sinon création ; fin des ventes, sinon début", () => {
    const createdAt = new Date("2026-09-01T00:00:00Z");
    const publishedAt = new Date("2026-09-10T00:00:00Z");
    const startsAt = new Date("2026-11-21T19:00:00Z");
    expect(
      salesWindow({
        salesStartAt: start,
        salesEndAt: end,
        publishedAt,
        createdAt,
        startsAt,
      }),
    ).toEqual({ salesStart: start, salesEnd: end });
    expect(
      salesWindow({
        salesStartAt: null,
        salesEndAt: null,
        publishedAt,
        createdAt,
        startsAt,
      }),
    ).toEqual({ salesStart: publishedAt, salesEnd: startsAt });
    expect(
      salesWindow({
        salesStartAt: null,
        salesEndAt: null,
        publishedAt: null,
        createdAt,
        startsAt,
      }).salesStart,
    ).toBe(createdAt);
  });
});

describe("montant d'un agrégat de commandes (accueil)", () => {
  it("encaissé sans frais, recette nette avec ; aucune commande : zéro", async () => {
    const { netOfSums } = await import("../src");
    expect(netOfSums({ totalMinor: 10_000, refundedMinor: 1_800 })).toBe(8_200);
    expect(
      netOfSums({
        totalMinor: 10_000,
        refundedMinor: 1_800,
        applicationFeeMinor: 300,
        paymentFeeMinor: 150,
      }),
    ).toBe(7_750);
    expect(
      netOfSums({
        totalMinor: null,
        refundedMinor: null,
        applicationFeeMinor: null,
        paymentFeeMinor: null,
      }),
    ).toBe(0);
  });
});
