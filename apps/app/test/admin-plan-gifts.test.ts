import { beforeEach, describe, expect, it, vi } from "vitest";

// Stripe simulé, capable de répondre « abonnement introuvable » ou de refuser
const state: { fail: string | null } = { fail: null };
const calls: { method: string; args: unknown[] }[] = [];
const answer =
  (method: string) =>
  async (...args: unknown[]) => {
    calls.push({ method, args });
    if (state.fail) throw Object.assign(new Error("Stripe"), { code: state.fail });
    return { id: args[0], status: method === "cancel" ? "canceled" : "trialing" };
  };
const fake = { subscriptions: { cancel: answer("cancel"), update: answer("update") } };
vi.mock("@/lib/stripe", () => ({ stripe: () => fake }));

const { db } = await import("@/lib/db");
const { effectivePlan } = await import("@evoly/core");
const { assignPlan, extendTrial } = await import("@/server/platform");
type Staff = Parameters<typeof assignPlan>[0];

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function organisation(subscription?: Record<string, unknown>) {
  const admin = await db.user.create({
    data: { name: "Admin", email: `a.${rid()}@evoly.me`, emailVerified: true, platformRole: "ADMIN", twoFactorEnabled: true },
  });
  const st = { user: admin, session: { id: `s-${rid()}` }, verified: true } as unknown as Staff;
  const org = await db.organization.create({ data: { name: "Club", slug: `club-${rid()}`, subdomain: `club-${rid()}`, country: "BE", currency: "EUR" } });
  if (subscription) await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", ...subscription } });
  return { st, org };
}
const abonnement = (id: string) => db.subscription.findUniqueOrThrow({ where: { organizationId: id } });

describe("back-office : offres attribuées (pour offrir le Pro aux premiers clients)", () => {
  beforeEach(() => {
    calls.length = 0;
    state.fail = null;
  });

  it("le cas de la fiche : Partenaire sans limite lié à un abonnement Stripe disparu ; prolonger retire le lien et dit qu'il n'y a rien à prolonger", async () => {
    const { st, org } = await organisation({ planId: "partner", stripeSubscriptionId: `sub_${rid()}`, trialEndsAt: new Date(Date.now() + 280 * DAY) });
    state.fail = "resource_missing";
    await expect(extendTrial(st, org.id, 14)).rejects.toMatchObject({ code: "PLAN_UNLIMITED" });
    expect(calls.map((c) => c.method)).toEqual(["update"]);
    const sub = await abonnement(org.id);
    expect([sub.planId, sub.status, sub.stripeSubscriptionId]).toEqual(["partner", "ACTIVE", null]); // lien retiré, formule intacte
    calls.length = 0;
    await expect(extendTrial(st, org.id, 14)).rejects.toMatchObject({ code: "PLAN_UNLIMITED" });
    expect(calls).toEqual([]); // plus jamais d'appel à Stripe
  });

  it("offrir le Pro jusqu'à une date malgré un abonnement disparu : attribué, sans mélange, puis Free à sa date ; dates passées et invalides refusées", async () => {
    const { st, org } = await organisation({ stripeSubscriptionId: `sub_${rid()}`, trialEndsAt: new Date(Date.now() + 280 * DAY) });
    const until = new Date(Date.now() + 90 * DAY);
    await expect(assignPlan(st, org.id, "pro", until)).rejects.toMatchObject({ code: "PLAN_MANAGED_BY_STRIPE" }); // jamais en silence
    state.fail = "resource_missing";
    await assignPlan(st, org.id, "pro", until, { resilierStripe: true });
    const sub = await abonnement(org.id);
    expect([sub.planId, sub.status, sub.stripeSubscriptionId, sub.trialEndsAt, sub.currentPeriodEnd?.getTime()]).toEqual([
      "pro",
      "ACTIVE",
      null,
      null,
      until.getTime(),
    ]);
    expect(effectivePlan(sub, new Date(Date.now() + 89 * DAY))).toBe("pro");
    expect(effectivePlan(sub, new Date(Date.now() + 91 * DAY))).toBe("free"); // à sa date, retour en Free
    await expect(assignPlan(st, org.id, "pro", new Date(Date.now() - DAY))).rejects.toMatchObject({ code: "PLAN_UNTIL_PAST" });
    await expect(assignPlan(st, org.id, "pro", new Date("pas une date"))).rejects.toMatchObject({ code: "PLAN_UNTIL_INVALID" });
  });

  it("prolonger une offre datée recule sa fin sans changer de formule ; en Free, un essai Pro qui expire vraiment, puis repart d'aujourd'hui", async () => {
    const { st, org } = await organisation();
    const until = new Date(Date.now() + 30 * DAY);
    await assignPlan(st, org.id, "partner", until);
    await extendTrial(st, org.id, 14);
    let sub = await abonnement(org.id);
    expect([sub.planId, sub.status, sub.currentPeriodEnd?.getTime()]).toEqual(["partner", "ACTIVE", until.getTime() + 14 * DAY]);
    await assignPlan(st, org.id, "free", null);
    const now = new Date();
    await extendTrial(st, org.id, 10, now);
    sub = await abonnement(org.id);
    expect([sub.planId, sub.status, sub.trialEndsAt?.getTime()]).toEqual(["pro", "TRIALING", now.getTime() + 10 * DAY]);
    expect(effectivePlan(sub, new Date(now.getTime() + 11 * DAY))).toBe("free"); // l'essai offert expire vraiment
    const later = new Date(now.getTime() + 20 * DAY);
    await extendTrial(st, org.id, 5, later); // essai expiré : la prolongation repart du jour
    expect((await abonnement(org.id)).trialEndsAt?.getTime()).toBe(later.getTime() + 5 * DAY);
    expect(calls).toEqual([]);
  });

  it("un vrai refus de Stripe est affiché, et rien n'est modifié", async () => {
    const subId = `sub_${rid()}`;
    const { st, org } = await organisation({ stripeSubscriptionId: subId });
    state.fail = "api_error";
    await expect(extendTrial(st, org.id, 14)).rejects.toMatchObject({ code: "STRIPE_API_ERROR" });
    await expect(assignPlan(st, org.id, "partner", null, { resilierStripe: true })).rejects.toMatchObject({ code: "STRIPE_API_ERROR" });
    const sub = await abonnement(org.id);
    expect([sub.planId, sub.status, sub.stripeSubscriptionId]).toEqual(["pro", "ACTIVE", subId]);
  });
});
