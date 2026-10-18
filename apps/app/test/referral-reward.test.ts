import { effectivePlan } from "@evoly/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ available: true, credits: [] as Array<{ customer: string; amount: number; currency: string }> }));
vi.mock("@/lib/stripe", () => ({
  stripe: () =>
    fake.available
      ? {
          customers: {
            createBalanceTransaction: async (customer: string, p: { amount: number; currency: string }) => (
              fake.credits.push({ customer, amount: p.amount, currency: p.currency }),
              {}
            ),
          },
        }
      : null,
}));
const { db } = await import("@/lib/db");
const { qualifyReferral } = await import("@/server/referrals");

const rid = () => Math.random().toString(36).slice(2, 10);
const day = 86_400_000;
type Sub = {
  status: "ACTIVE" | "TRIALING" | "CANCELED";
  currentPeriodEnd?: Date | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
};
async function setup(referrer: { sub?: Sub; status?: "ACTIVE" | "SUSPENDED" } = {}, referredName = "Les Amis du Jazz") {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille", email: `parrain.${id}@exemple.be`, emailVerified: true } });
  const role = await db.role.findUniqueOrThrow({ where: { systemKey: "OWNER" } });
  const parrain = await db.organization.create({
    data: {
      name: "Club parrain",
      slug: `parrain-${id}`,
      subdomain: `parrain-${id}`,
      country: "BE",
      currency: "EUR",
      status: referrer.status ?? "ACTIVE",
      ...(referrer.sub
        ? {
            subscription: {
              create: {
                planId: "pro",
                currency: "EUR",
                status: referrer.sub.status,
                currentPeriodEnd: referrer.sub.currentPeriodEnd ?? null,
                stripeSubscriptionId: referrer.sub.stripeSubscriptionId ?? null,
                stripeCustomerId: referrer.sub.stripeCustomerId ?? null,
              },
            },
          }
        : {}),
      members: { create: { userId: owner.id, roleId: role.id } },
    },
  });
  const filleul = await db.organization.create({
    data: { name: referredName, slug: `filleul-${id}`, subdomain: `filleul-${id}`, country: "BE", currency: "EUR" },
  });
  await db.referral.create({ data: { code: `PAR${id}`.toUpperCase(), referrerOrgId: parrain.id, referredOrgId: filleul.id, status: "SIGNED_UP" } });
  return { parrain, filleul, owner };
}
const sub = (orgId: string) => db.subscription.findUnique({ where: { organizationId: orgId } });
const status = async (filleulId: string) => (await db.referral.findUniqueOrThrow({ where: { referredOrgId: filleulId } })).status;
beforeEach(() => {
  fake.available = true;
  fake.credits = [];
});

describe("récompense du parrainage : un mois de Pro au parrain, une seule fois (RG-PAR-01)", () => {
  it("abonnement Stripe en cours : crédit de 29 € sur la prochaine facture, abonnement inchangé", async () => {
    const s = await setup({
      sub: { status: "ACTIVE", stripeSubscriptionId: `sub_${rid()}`, stripeCustomerId: "cus_parrain", currentPeriodEnd: new Date(Date.now() + 10 * day) },
    });
    const before = await sub(s.parrain.id);
    expect(await qualifyReferral(s.filleul.id)).toBe(true);
    expect(fake.credits).toEqual([{ customer: "cus_parrain", amount: -2900, currency: "eur" }]);
    expect(await sub(s.parrain.id)).toMatchObject({
      status: before!.status,
      stripeSubscriptionId: before!.stripeSubscriptionId,
      currentPeriodEnd: before!.currentPeriodEnd,
    });
    expect(await status(s.filleul.id)).toBe("REWARDED");
  });

  it("parrain en Free : 30 jours de Pro, gérés par Evoly", async () => {
    const s = await setup();
    const now = new Date();
    expect(await qualifyReferral(s.filleul.id, now)).toBe(true);
    const row = (await sub(s.parrain.id))!;
    expect(row.currentPeriodEnd!.getTime()).toBe(now.getTime() + 30 * day);
    expect(effectivePlan(row, new Date(now.getTime() + 29 * day))).toBe("pro");
    expect(effectivePlan(row, new Date(now.getTime() + 31 * day))).toBe("free");
  });

  it("Pro offert en cours : les 30 jours s'ajoutent à la suite ; Pro sans limite : rien à ajouter", async () => {
    const end = new Date(Date.now() + 10 * day);
    const s = await setup({ sub: { status: "CANCELED", currentPeriodEnd: end } });
    await qualifyReferral(s.filleul.id);
    expect((await sub(s.parrain.id))!.currentPeriodEnd!.getTime()).toBe(end.getTime() + 30 * day);
    const unlimited = await setup({ sub: { status: "ACTIVE", currentPeriodEnd: null } });
    await qualifyReferral(unlimited.filleul.id);
    expect((await sub(unlimited.parrain.id))!.currentPeriodEnd).toBeNull();
  });

  it("abonnement Stripe terminé : les 30 jours sont bien donnés (avant : annoncés par e-mail, jamais ajoutés)", async () => {
    const s = await setup({
      sub: { status: "CANCELED", stripeSubscriptionId: `sub_fini_${rid()}`, stripeCustomerId: "cus_ancien", currentPeriodEnd: new Date(Date.now() - day) },
    });
    const now = new Date();
    expect(await qualifyReferral(s.filleul.id, now)).toBe(true);
    const row = (await sub(s.parrain.id))!;
    expect(effectivePlan(row, new Date(now.getTime() + day))).toBe("pro");
    expect(row.stripeSubscriptionId).toBeNull(); // désormais géré par Evoly
    expect(fake.credits).toEqual([]);
  });

  it("Stripe indisponible pour un abonnement en cours : récompense reportée à la vente suivante, puis donnée une seule fois", async () => {
    fake.available = false;
    const s = await setup({ sub: { status: "ACTIVE", stripeSubscriptionId: `sub_${rid()}`, stripeCustomerId: "cus_parrain" } });
    expect(await qualifyReferral(s.filleul.id)).toBe(false);
    expect(await status(s.filleul.id)).toBe("SIGNED_UP");
    fake.available = true;
    expect(await qualifyReferral(s.filleul.id)).toBe(true);
    expect(await qualifyReferral(s.filleul.id)).toBe(false);
    expect(fake.credits).toHaveLength(1);
  });

  it("jamais deux récompenses ; parrain suspendu ou sans parrainage : aucune", async () => {
    const s = await setup();
    expect(await qualifyReferral(s.filleul.id)).toBe(true);
    expect(await qualifyReferral(s.filleul.id)).toBe(false);
    const suspended = await setup({ status: "SUSPENDED" });
    expect(await qualifyReferral(suspended.filleul.id)).toBe(false);
    expect(await sub(suspended.parrain.id)).toBeNull();
    expect(await qualifyReferral(`sans-parrain-${rid()}`)).toBe(false);
  });

  it("e-mail au parrain : le nom de l'organisation parrainée ne peut pas injecter de HTML", async () => {
    const s = await setup({}, "<b>Club piégé</b>");
    await qualifyReferral(s.filleul.id);
    const mail = await db.emailMessage.findFirstOrThrow({ where: { template: "referral.rewarded", toEmail: s.owner.email } });
    expect(mail.toEmail).toBe(s.owner.email);
    const html = (mail as unknown as { html?: string | null }).html;
    if (html) expect(html).not.toContain("<b>Club piégé</b>");
  });
});
