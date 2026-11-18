import { describe, expect, it } from "vitest";
import {
  addBillingInterval,
  daysBeforeDowngrade,
  effectivePlan,
  firstPeriodStart,
  nextRenewalAttempt,
  renewsWithMollie,
  trialEligible,
  yearlySavings,
} from "../src";
import type { SubscriptionInput } from "../src/plans";
const SUB_DEFAULTS = {
  currentPeriodEnd: null,
  pastDueSince: null,
  trialEndsAt: null,
};

describe("abonnement Pro (section 3.5)", () => {
  it("un seul essai par organisation (RG-SUB-02)", () => {
    expect(trialEligible(null)).toBe(true);
    expect(trialEligible({ trialEndsAt: null })).toBe(true);
    expect(trialEligible({ trialEndsAt: new Date() })).toBe(false);
    // déjà abonné par Mollie (mandat), même résilié depuis : plus d'essai
    expect(trialEligible({ trialEndsAt: null, mollieMandateId: "mdt_1" })).toBe(
      false,
    );
  });

  describe("abonnement payé par Mollie (docs/MOLLIE.md, lot 6)", () => {
    it("périodes d'un mois ou d'un an, même heure, ramenées au dernier jour du mois", () => {
      expect(
        addBillingInterval(
          new Date("2026-11-18T09:30:00Z"),
          "MONTH",
        ).toISOString(),
      ).toBe("2026-12-18T09:30:00.000Z");
      expect(
        addBillingInterval(
          new Date("2026-12-18T09:30:00Z"),
          "MONTH",
        ).toISOString(),
      ).toBe("2027-01-18T09:30:00.000Z");
      expect(
        addBillingInterval(
          new Date("2027-01-31T08:00:00Z"),
          "MONTH",
        ).toISOString(),
      ).toBe("2027-02-28T08:00:00.000Z");
      expect(
        addBillingInterval(
          new Date("2028-01-31T08:00:00Z"),
          "MONTH",
        ).toISOString(),
      ).toBe("2028-02-29T08:00:00.000Z");
      expect(
        addBillingInterval(
          new Date("2028-02-29T08:00:00Z"),
          "YEAR",
        ).toISOString(),
      ).toBe("2029-02-28T08:00:00.000Z");
      expect(
        addBillingInterval(
          new Date("2026-11-18T09:30:00Z"),
          "YEAR",
        ).toISOString(),
      ).toBe("2027-11-18T09:30:00.000Z");
    });

    it("après un échec : nouvelle tentative 3 jours plus tard, 3 tentatives en tout, dans les 7 jours avant le retour en Free", () => {
      const failed = new Date("2026-11-18T10:00:00Z");
      expect(nextRenewalAttempt(failed, 1)?.toISOString()).toBe(
        "2026-11-21T10:00:00.000Z",
      );
      expect(nextRenewalAttempt(failed, 2)?.toISOString()).toBe(
        "2026-11-21T10:00:00.000Z",
      );
      expect(nextRenewalAttempt(failed, 3)).toBeNull();
    });

    it("renouvelé par Evoly tant que le mandat existe et que l'abonnement n'est ni résilié ni terminé", () => {
      const base = {
        billingProvider: "MOLLIE",
        mollieMandateId: "mdt_1",
        status: "ACTIVE" as const,
        cancelAtPeriodEnd: false,
      };
      expect(renewsWithMollie(base)).toBe(true);
      expect(renewsWithMollie({ ...base, status: "PAST_DUE" })).toBe(true);
      expect(renewsWithMollie({ ...base, cancelAtPeriodEnd: true })).toBe(
        false,
      );
      expect(renewsWithMollie({ ...base, status: "CANCELED" })).toBe(false);
      expect(renewsWithMollie({ ...base, mollieMandateId: null })).toBe(false);
      expect(renewsWithMollie({ ...base, billingProvider: null })).toBe(false);
      expect(renewsWithMollie(null)).toBe(false);
    });

    it("première période payée : à la fin de l'essai ou du Pro offert ; sinon tout de suite", () => {
      const now = new Date("2026-11-18T12:00:00Z");
      const later = new Date("2026-11-25T12:00:00Z");
      const local = {
        planId: "pro",
        currentPeriodEnd: null,
        pastDueSince: null,
        trialEndsAt: null,
      };
      expect(firstPeriodStart(null, now)).toEqual(now);
      // essai sans carte
      expect(
        firstPeriodStart(
          {
            ...local,
            status: "TRIALING",
            trialEndsAt: later,
            currentPeriodEnd: later,
          },
          now,
        ),
      ).toEqual(later);
      // essai terminé : Free, donc tout de suite
      expect(
        firstPeriodStart(
          {
            ...local,
            status: "TRIALING",
            trialEndsAt: new Date("2026-11-17T12:00:00Z"),
          },
          now,
        ),
      ).toEqual(now);
      // Pro offert jusqu'à une date, ou jours de parrainage (période résiliée qui court encore)
      expect(
        firstPeriodStart(
          { ...local, status: "ACTIVE", currentPeriodEnd: later },
          now,
        ),
      ).toEqual(later);
      expect(
        firstPeriodStart(
          { ...local, status: "CANCELED", currentPeriodEnd: later },
          now,
        ),
      ).toEqual(later);
      // offre Partenaire : jamais de période payée calée dessus
      expect(
        firstPeriodStart(
          {
            ...local,
            planId: "partner",
            status: "ACTIVE",
            currentPeriodEnd: later,
          },
          now,
        ),
      ).toEqual(now);
    });
  });
  it("impayé : 7 jours avant la rétrogradation (RG-SUB-06)", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(
      daysBeforeDowngrade(
        { status: "PAST_DUE", pastDueSince: new Date("2026-10-08T12:00:00Z") },
        now,
      ),
    ).toBe(5);
    expect(
      daysBeforeDowngrade(
        { status: "PAST_DUE", pastDueSince: new Date("2026-09-30T12:00:00Z") },
        now,
      ),
    ).toBe(0);
    expect(
      daysBeforeDowngrade({ status: "ACTIVE", pastDueSince: null }, now),
    ).toBeNull();
    const sub = {
      planId: "pro" as const,
      status: "PAST_DUE" as const,
      currentPeriodEnd: null,
    };
    expect(
      effectivePlan(
        {
          ...SUB_DEFAULTS,
          ...{ ...sub, pastDueSince: new Date("2026-10-08T12:00:00Z") },
        } as SubscriptionInput,
        now,
      ),
    ).toBe("pro");
    expect(
      effectivePlan(
        {
          ...SUB_DEFAULTS,
          ...{ ...sub, pastDueSince: new Date("2026-10-01T12:00:00Z") },
        } as SubscriptionInput,
        now,
      ),
    ).toBe("free");
  });
  it("résiliation : Pro jusqu'à la fin de la période payée (RG-SUB-04)", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(
      effectivePlan(
        {
          ...SUB_DEFAULTS,
          ...{
            planId: "pro",
            status: "CANCELED",
            currentPeriodEnd: new Date("2026-10-20T00:00:00Z"),
            pastDueSince: null,
          },
        } as SubscriptionInput,
        now,
      ),
    ).toBe("pro");
    expect(
      effectivePlan(
        {
          ...SUB_DEFAULTS,
          ...{
            planId: "pro",
            status: "CANCELED",
            currentPeriodEnd: new Date("2026-10-01T00:00:00Z"),
            pastDueSince: null,
          },
        } as SubscriptionInput,
        now,
      ),
    ).toBe("free");
  });
  it("offre annuelle : 24,65 € par mois, −15 %", () => {
    expect(yearlySavings(2900, 29580)).toEqual({
      perMonthMinor: 2465,
      savingBps: 1500,
    });
  });
});
