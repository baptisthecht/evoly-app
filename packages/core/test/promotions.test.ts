import { describe, expect, it } from "vitest";
import {
  normalizePromotionCode,
  pickPromotion,
  promotionApplies,
  promotionGrantEnd,
  promotionStatus,
  promotionText,
  type PromotionContext,
  type PromotionRule,
} from "../src/promotions";

const now = new Date("2026-11-15T10:00:00Z");
const promo = (over: Partial<PromotionRule> = {}): PromotionRule => ({
  id: "p1",
  code: "lancement",
  active: true,
  planId: "pro",
  durationValue: 3,
  durationUnit: "MONTH",
  startsAt: null,
  endsAt: null,
  audience: "ALL_NEW",
  countries: [],
  organizationTypes: [],
  sources: [],
  maxRedemptions: null,
  redeemedCount: 0,
  perOwnerLimit: 1,
  priority: 0,
  ...over,
});
const ctx = (over: Partial<PromotionContext> = {}): PromotionContext => ({
  now,
  country: "BE",
  organizationType: "ASSOCIATION",
  offerCode: null,
  source: null,
  ownerRedemptions: {},
  ...over,
});

describe("état d'une offre", () => {
  it("désactivée, programmée, en cours, terminée, épuisée", () => {
    expect(promotionStatus(promo({ active: false }), now)).toBe("DISABLED");
    expect(
      promotionStatus(promo({ startsAt: new Date("2026-12-01") }), now),
    ).toBe("SCHEDULED");
    expect(
      promotionStatus(
        promo({
          startsAt: new Date("2026-11-01"),
          endsAt: new Date("2027-03-31T21:59:59Z"),
        }),
        now,
      ),
    ).toBe("RUNNING");
    expect(
      promotionStatus(promo({ endsAt: new Date("2026-11-01") }), now),
    ).toBe("ENDED");
    expect(
      promotionStatus(promo({ maxRedemptions: 50, redeemedCount: 50 }), now),
    ).toBe("EXHAUSTED");
  });
});

describe("conditions d'une offre", () => {
  it("toute nouvelle organisation : oui ; seulement par le lien : avec son code, quelle que soit la casse", () => {
    expect(promotionApplies(promo(), ctx())).toBe(true);
    expect(promotionApplies(promo({ audience: "LINK" }), ctx())).toBe(false);
    expect(
      promotionApplies(
        promo({ audience: "LINK" }),
        ctx({ offerCode: "LANCEMENT" }),
      ),
    ).toBe(true);
    expect(
      promotionApplies(
        promo({ audience: "LINK" }),
        ctx({ offerCode: "autre" }),
      ),
    ).toBe(false);
  });

  it("pays, types d'organisation et sources : une liste vide accepte tout, sinon la valeur doit y figurer", () => {
    expect(promotionApplies(promo({ countries: ["BE", "LU"] }), ctx())).toBe(
      true,
    );
    expect(promotionApplies(promo({ countries: ["FR"] }), ctx())).toBe(false);
    expect(
      promotionApplies(promo({ organizationTypes: ["COMPANY"] }), ctx()),
    ).toBe(false);
    expect(
      promotionApplies(
        promo({ sources: ["google"] }),
        ctx({ source: "Google" }),
      ),
    ).toBe(true);
    expect(
      promotionApplies(promo({ sources: ["google"] }), ctx({ source: null })),
    ).toBe(false); // source inconnue : non
  });

  it("limite par organisateur", () => {
    expect(
      promotionApplies(
        promo({ perOwnerLimit: 1 }),
        ctx({ ownerRedemptions: { p1: 1 } }),
      ),
    ).toBe(false);
    expect(
      promotionApplies(
        promo({ perOwnerLimit: 2 }),
        ctx({ ownerRedemptions: { p1: 1 } }),
      ),
    ).toBe(true);
  });
});

describe("choix entre plusieurs offres", () => {
  it("la plus prioritaire ; à priorité égale, celle du lien suivi, puis la plus récente", () => {
    const a = promo({ id: "a", priority: 1 });
    const b = promo({ id: "b", priority: 5, countries: ["FR"] }); // ne s'applique pas
    const c = promo({ id: "c", code: "google", audience: "LINK", priority: 1 });
    const d = promo({
      id: "d",
      priority: 1,
      createdAt: new Date("2026-11-10"),
    });
    expect(pickPromotion([a, b], ctx())!.id).toBe("a");
    expect(pickPromotion([a, c], ctx({ offerCode: "google" }))!.id).toBe("c");
    expect(pickPromotion([a, d], ctx())!.id).toBe("d");
    expect(pickPromotion([b], ctx())).toBeNull();
  });
});

describe("durée et textes", () => {
  it("fin du plan offert : en mois ou en jours", () => {
    expect(promotionGrantEnd(promo(), now).toISOString()).toBe(
      "2027-02-15T10:00:00.000Z",
    );
    expect(
      promotionGrantEnd(
        promo({ durationValue: 30, durationUnit: "DAY" }),
        now,
      ).toISOString(),
    ).toBe("2026-12-15T10:00:00.000Z");
  });

  it("textes dans la langue du visiteur, sinon en français puis en anglais ; sans bandeau, aucun", () => {
    const m = {
      fr: { banner: "3 mois offerts", short: "Offert", cta: "En profiter" },
      en: { banner: "3 months free" },
    };
    expect(promotionText(m, "nl-BE")).toEqual({
      banner: "3 mois offerts",
      short: "Offert",
      cta: "En profiter",
    });
    expect(promotionText(m, "en")).toEqual({
      banner: "3 months free",
      short: "3 months free",
      cta: "",
    });
    expect(promotionText({ fr: { banner: "  " } }, "fr")).toBeNull();
    expect(promotionText(null, "fr")).toBeNull();
  });

  it("code de campagne : lettres, chiffres et tirets, en minuscules", () => {
    expect(normalizePromotionCode(" Google-Ads-2026 ")).toBe("google-ads-2026");
    for (const bad of [
      "a",
      "-debut",
      "fin-",
      "avec espace",
      "<script>",
      "x".repeat(41),
      null,
    ])
      expect(normalizePromotionCode(bad)).toBeNull();
  });
});
