import { EUR_TERMS } from "@evoly/core";
import { describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  calls: 0,
  rows: [
    {
      id: "free",
      features: ["RESALE"],
      feeRateBps: 200,
      currencyTerms: [
        { currency: "EUR", feeFixedMinor: 29, feeCapMinor: 250 },
        { currency: "CHF", feeFixedMinor: 30, feeCapMinor: 270 },
      ],
    },
    { id: "pro", features: ["RESALE", "TEAM_MEMBERS"], feeRateBps: 200, currencyTerms: [] },
  ],
}));
vi.mock("@/lib/db", () => ({ db: { plan: { findMany: async () => (store.calls++, store.rows) } } }));
const { getPlans } = await import("@/server/plans");

describe("offres lues en base (côté serveur)", () => {
  it("grilles par devise, grille par défaut quand une devise manque, Partenaire sans ligne en base : fonctions du Pro", async () => {
    const plans = await getPlans();
    expect(plans.free.features).toEqual(["RESALE"]);
    expect(plans.free.terms.EUR).toEqual({ planId: "free", currency: "EUR", fixedMinor: 29, rateBps: 200, capMinor: 250 });
    expect(plans.free.terms.CHF).toEqual({ planId: "free", currency: "CHF", fixedMinor: 30, rateBps: 200, capMinor: 270 });
    expect(plans.pro.terms.EUR).toEqual(EUR_TERMS.pro);
    expect(plans.partner.features).toEqual(["RESALE", "TEAM_MEMBERS"]);
    expect(plans.partner.terms.EUR).toEqual(EUR_TERMS.partner);
  });

  it("gardées une minute en mémoire : aucune requête dans l'intervalle, relues ensuite", async () => {
    const calls = store.calls;
    await getPlans();
    expect(store.calls).toBe(calls);
    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    await getPlans();
    expect(store.calls).toBe(calls + 1);
    spy.mockRestore();
  });
});
