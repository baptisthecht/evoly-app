import { describe, expect, it } from "vitest";
import { normalizePromoCode, unitDiscount, validatePromo, type PromoInput } from "../src";

const now = new Date("2026-10-20T12:00:00Z");
const base: PromoInput = {
  id: "p1",
  eventId: "e1",
  code: "BIENVENUE",
  discountType: "PERCENT",
  percentOffBps: 5000,
  ticketTypeIds: [],
  usedCount: 0,
  isActive: true,
};
const ctx = { eventId: "e1", now, usesByEmail: 0, cartTicketTypeIds: ["t1"] };

describe("validation d'un code promo (RG-PRM-01)", () => {
  it("code valide", () => expect(validatePromo(base, ctx)).toEqual({ ok: true }));
  it.each<[Partial<PromoInput> | null, Partial<typeof ctx>, string]>([
    [null, {}, "NOT_FOUND"],
    [{ eventId: "autre" }, {}, "WRONG_EVENT"],
    [{ isActive: false }, {}, "INACTIVE"],
    [{ startsAt: new Date("2026-10-21T00:00:00Z") }, {}, "NOT_STARTED"],
    [{ expiresAt: new Date("2026-10-20T12:00:00Z") }, {}, "EXPIRED"],
    [{ maxUses: 5, usedCount: 5 }, {}, "EXHAUSTED"],
    [{ maxUsesPerEmail: 1 }, { usesByEmail: 1 }, "EMAIL_LIMIT"],
    [{ ticketTypeIds: ["t2"] }, {}, "NOT_APPLICABLE"],
  ])("refus %#", (patch, ctxPatch, error) => {
    const promo = patch === null ? null : { ...base, ...patch };
    expect(validatePromo(promo, { ...ctx, ...ctxPatch })).toEqual({ ok: false, error });
  });
  it("normalise la saisie", () => expect(normalizePromoCode("  bien venue ")).toBe("BIENVENUE"));
});

describe("remise par billet (RG-PRM-02)", () => {
  it("pourcentage, montant, gratuité", () => {
    expect(unitDiscount(3000, base)).toBe(1500);
    expect(unitDiscount(3000, { ...base, discountType: "AMOUNT", amountOffMinor: 500 })).toBe(500);
    expect(unitDiscount(400, { ...base, discountType: "AMOUNT", amountOffMinor: 500 })).toBe(400);
    expect(unitDiscount(3000, { ...base, discountType: "FREE" })).toBe(3000);
  });
  it("jamais au-delà du prix, rien sur un billet gratuit", () => {
    expect(unitDiscount(3000, { ...base, percentOffBps: 15000 })).toBe(3000);
    expect(unitDiscount(0, base)).toBe(0);
    expect(unitDiscount(1000, { ...base, percentOffBps: null })).toBe(0);
    expect(unitDiscount(1000, { ...base, discountType: "AMOUNT", amountOffMinor: null })).toBe(0);
  });
});
