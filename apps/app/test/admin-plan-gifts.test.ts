import { describe, expect, it } from "vitest";
import { effectivePlan } from "@evoly/core";
import { db } from "@/lib/db";
import { assignPlan, extendTrial } from "@/server/platform";

type Staff = Parameters<typeof assignPlan>[0];

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function organisation(subscription?: Record<string, unknown>) {
  const admin = await db.user.create({
    data: {
      name: "Admin",
      email: `a.${rid()}@evoly.me`,
      emailVerified: true,
      platformRole: "ADMIN",
      twoFactorEnabled: true,
    },
  });
  const st = {
    user: admin,
    session: { id: `s-${rid()}` },
    verified: true,
  } as unknown as Staff;
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${rid()}`,
      subdomain: `club-${rid()}`,
      country: "BE",
      currency: "EUR",
    },
  });
  if (subscription)
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        ...subscription,
      },
    });
  return { st, org };
}
const abonnement = (id: string) =>
  db.subscription.findUniqueOrThrow({ where: { organizationId: id } });

describe("back-office : offres attribuées (pour offrir le Pro aux premiers clients)", () => {
  it("le cas de la fiche : Partenaire sans limite avec une date d'essai d'avant ; prolonger dit qu'il n'y a rien à prolonger, sans rien changer", async () => {
    const trialEndsAt = new Date(Date.now() + 280 * DAY);
    const { st, org } = await organisation({ planId: "partner", trialEndsAt });
    await expect(extendTrial(st, org.id, 14)).rejects.toMatchObject({
      code: "PLAN_UNLIMITED",
    });
    const sub = await abonnement(org.id);
    expect([
      sub.planId,
      sub.status,
      sub.currentPeriodEnd,
      sub.trialEndsAt?.getTime(),
    ]).toEqual(["partner", "ACTIVE", null, trialEndsAt.getTime()]); // formule intacte
  });

  it("offrir le Pro jusqu'à une date à un abonné Mollie : résiliation explicite exigée, puis attribué sans mélange, et Free à sa date ; dates passées et invalides refusées", async () => {
    const { st, org } = await organisation({
      billingProvider: "MOLLIE",
      mollieCustomerId: `cst_${rid()}`,
      mollieMandateId: `mdt_${rid()}`,
      paymentMethodLabel: "Visa •••• 4242",
      interval: "MONTH",
      currentPeriodEnd: new Date(Date.now() + 20 * DAY),
      trialEndsAt: new Date(Date.now() - 280 * DAY),
    });
    const until = new Date(Date.now() + 90 * DAY);
    await expect(assignPlan(st, org.id, "pro", until)).rejects.toMatchObject({
      code: "PLAN_MANAGED_BY_MOLLIE",
    }); // jamais en silence
    expect(await abonnement(org.id)).toMatchObject({
      billingProvider: "MOLLIE",
      mollieMandateId: expect.stringMatching(/^mdt_/),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    }); // refusé : rien n'est modifié, Evoly prélève toujours
    await assignPlan(st, org.id, "pro", until, { resilier: true });
    const sub = await abonnement(org.id);
    expect([
      sub.planId,
      sub.status,
      sub.billingProvider,
      sub.mollieMandateId,
      sub.paymentMethodLabel,
      sub.trialEndsAt,
      sub.currentPeriodEnd?.getTime(),
    ]).toEqual(["pro", "ACTIVE", null, null, null, null, until.getTime()]); // plus aucun prélèvement
    expect(sub.canceledAt).not.toBeNull();
    expect(effectivePlan(sub, new Date(Date.now() + 89 * DAY))).toBe("pro");
    expect(effectivePlan(sub, new Date(Date.now() + 91 * DAY))).toBe("free"); // à sa date, retour en Free
    await expect(
      assignPlan(st, org.id, "pro", new Date(Date.now() - DAY)),
    ).rejects.toMatchObject({ code: "PLAN_UNTIL_PAST" });
    await expect(
      assignPlan(st, org.id, "pro", new Date("pas une date")),
    ).rejects.toMatchObject({ code: "PLAN_UNTIL_INVALID" });
  });

  it("prolonger une offre datée recule sa fin sans changer de formule ; en Free, un essai Pro qui expire vraiment, puis repart d'aujourd'hui", async () => {
    const { st, org } = await organisation();
    const until = new Date(Date.now() + 30 * DAY);
    await assignPlan(st, org.id, "partner", until);
    await extendTrial(st, org.id, 14);
    let sub = await abonnement(org.id);
    expect([sub.planId, sub.status, sub.currentPeriodEnd?.getTime()]).toEqual([
      "partner",
      "ACTIVE",
      until.getTime() + 14 * DAY,
    ]);
    await assignPlan(st, org.id, "free", null);
    const now = new Date();
    await extendTrial(st, org.id, 10, now);
    sub = await abonnement(org.id);
    expect([sub.planId, sub.status, sub.trialEndsAt?.getTime()]).toEqual([
      "pro",
      "TRIALING",
      now.getTime() + 10 * DAY,
    ]);
    expect(effectivePlan(sub, new Date(now.getTime() + 11 * DAY))).toBe("free"); // l'essai offert expire vraiment
    const later = new Date(now.getTime() + 20 * DAY);
    await extendTrial(st, org.id, 5, later); // essai expiré : la prolongation repart du jour
    expect((await abonnement(org.id)).trialEndsAt?.getTime()).toBe(
      later.getTime() + 5 * DAY,
    );
  });
});
