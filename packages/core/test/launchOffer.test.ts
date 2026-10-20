import { describe, expect, it } from "vitest";
import { effectivePlan } from "../src/plans";
import { LAUNCH_OFFER_UNTIL, launchOfferDeadline, launchOfferEnd } from "../src/launchOffer";

describe("offre de lancement : 3 mois de Pro offerts", () => {
  it("organisation créée avant la date limite : Pro pendant 3 mois", () => {
    expect(launchOfferEnd(new Date("2026-11-15T10:00:00Z"))!.toISOString()).toBe("2027-02-15T10:00:00.000Z");
  });

  it("le 31 mars 2027 à 23 h 59 (Bruxelles) encore ; une minute après, plus du tout", () => {
    expect(launchOfferEnd(new Date("2027-03-31T21:59:00Z"))).not.toBeNull();
    expect(launchOfferEnd(new Date("2027-03-31T22:00:01Z"))).toBeNull();
  });

  it("date limite remplaçable ; « off » ou une valeur illisible : aucune offre", () => {
    expect(launchOfferDeadline()!.toISOString()).toBe(new Date(LAUNCH_OFFER_UNTIL).toISOString());
    expect(launchOfferEnd(new Date("2027-05-01T00:00:00Z"), "2027-06-30T23:59:59+02:00")).not.toBeNull();
    expect(launchOfferEnd(new Date("2026-11-15T10:00:00Z"), "off")).toBeNull();
    expect(launchOfferEnd(new Date("2026-11-15T10:00:00Z"), "pas une date")).toBeNull();
  });

  it("à la fin des 3 mois, l'organisation redevient Free toute seule (abonnement attribué par Evoly)", () => {
    const created = new Date("2026-11-15T10:00:00Z");
    const sub = { planId: "pro" as const, status: "ACTIVE" as const, currentPeriodEnd: launchOfferEnd(created), trialEndsAt: null, stripeSubscriptionId: null };
    expect(effectivePlan(sub as never, new Date("2027-02-15T09:00:00Z"))).toBe("pro");
    expect(effectivePlan(sub as never, new Date("2027-02-15T11:00:00Z"))).toBe("free");
  });
});
