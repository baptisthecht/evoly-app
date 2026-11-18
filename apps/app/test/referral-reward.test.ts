import { effectivePlan, renewsWithMollie } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { qualifyReferral } from "@/server/referrals";

const rid = () => Math.random().toString(36).slice(2, 10);
const day = 86_400_000;
type Sub = {
  planId?: "pro" | "partner";
  status: "ACTIVE" | "TRIALING" | "CANCELED";
  currentPeriodEnd?: Date | null;
  /** abonnement payé par Mollie : Evoly prélève les renouvellements sur ce mandat */
  mollie?: boolean;
  cancelAtPeriodEnd?: boolean;
  renewalNoticeFor?: Date | null;
};
async function setup(
  referrer: { sub?: Sub; status?: "ACTIVE" | "SUSPENDED" } = {},
  referredName = "Les Amis du Jazz",
) {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille",
      email: `parrain.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const role = await db.role.findUniqueOrThrow({
    where: { systemKey: "OWNER" },
  });
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
                planId: referrer.sub.planId ?? "pro",
                currency: "EUR",
                status: referrer.sub.status,
                currentPeriodEnd: referrer.sub.currentPeriodEnd ?? null,
                cancelAtPeriodEnd: referrer.sub.cancelAtPeriodEnd ?? false,
                renewalNoticeFor: referrer.sub.renewalNoticeFor ?? null,
                ...(referrer.sub.mollie
                  ? {
                      interval: "MONTH" as const,
                      billingProvider: "MOLLIE" as const,
                      mollieCustomerId: `cst_parrain_${id}`,
                      mollieMandateId: `mdt_parrain_${id}`,
                    }
                  : {}),
              },
            },
          }
        : {}),
      members: { create: { userId: owner.id, roleId: role.id } },
    },
  });
  const filleul = await db.organization.create({
    data: {
      name: referredName,
      slug: `filleul-${id}`,
      subdomain: `filleul-${id}`,
      country: "BE",
      currency: "EUR",
    },
  });
  await db.referral.create({
    data: {
      code: `PAR${id}`.toUpperCase(),
      referrerOrgId: parrain.id,
      referredOrgId: filleul.id,
      status: "SIGNED_UP",
    },
  });
  return { parrain, filleul, owner };
}
const sub = (orgId: string) =>
  db.subscription.findUnique({ where: { organizationId: orgId } });
const status = async (filleulId: string) =>
  (await db.referral.findUniqueOrThrow({ where: { referredOrgId: filleulId } }))
    .status;
const how = async (organizationId: string) =>
  (
    await db.auditLog.findFirstOrThrow({
      where: { organizationId, action: "referral.rewarded" },
    })
  ).metadata;

describe("récompense du parrainage : un mois de Pro au parrain, une seule fois (RG-PAR-01)", () => {
  it("abonnement payé par Mollie en cours : le prochain prélèvement recule de 30 jours, l'abonnement continue, préavis à refaire", async () => {
    const end = new Date(Date.now() + 10 * day);
    const s = await setup({
      sub: {
        status: "ACTIVE",
        mollie: true,
        currentPeriodEnd: end,
        renewalNoticeFor: end, // préavis du prélèvement déjà envoyé
      },
    });
    expect(await qualifyReferral(s.filleul.id)).toBe(true);
    const row = (await sub(s.parrain.id))!;
    expect(row).toMatchObject({
      planId: "pro",
      status: "ACTIVE",
      billingProvider: "MOLLIE",
      mollieMandateId: expect.stringMatching(/^mdt_parrain_/),
      cancelAtPeriodEnd: false,
      renewalNoticeFor: null, // le préavis repartira avant la nouvelle date
    });
    expect(row.currentPeriodEnd!.getTime()).toBe(end.getTime() + 30 * day);
    expect(renewsWithMollie(row)).toBe(true);
    expect(await how(s.parrain.id)).toEqual({ how: "MOLLIE_DAYS" });
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
    const s = await setup({
      sub: { status: "CANCELED", currentPeriodEnd: end },
    });
    await qualifyReferral(s.filleul.id);
    expect((await sub(s.parrain.id))!.currentPeriodEnd!.getTime()).toBe(
      end.getTime() + 30 * day,
    );
    const unlimited = await setup({
      sub: { status: "ACTIVE", currentPeriodEnd: null },
    });
    await qualifyReferral(unlimited.filleul.id);
    expect((await sub(unlimited.parrain.id))!.currentPeriodEnd).toBeNull();
  });

  it("offre Partenaire en cours, sans limite ou datée : gardée telle quelle (avant le 17 novembre 2026 : remplacée par 30 jours de Pro)", async () => {
    const end = new Date(Date.now() + 10 * day);
    for (const currentPeriodEnd of [null, end]) {
      const s = await setup({
        sub: { planId: "partner", status: "ACTIVE", currentPeriodEnd },
      });
      expect(await qualifyReferral(s.filleul.id)).toBe(true);
      const row = (await sub(s.parrain.id))!;
      expect(row).toMatchObject({
        planId: "partner",
        status: "ACTIVE",
        currentPeriodEnd,
      });
      expect(effectivePlan(row, new Date())).toBe("partner");
      expect(await status(s.filleul.id)).toBe("REWARDED");
    }
  });

  it("abonnement payé par Mollie terminé : les 30 jours de Pro sont donnés, gérés par Evoly, sans aucun prélèvement", async () => {
    const s = await setup({
      sub: {
        status: "CANCELED",
        mollie: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(Date.now() - day),
      },
    });
    const now = new Date();
    expect(await qualifyReferral(s.filleul.id, now)).toBe(true);
    const row = (await sub(s.parrain.id))!;
    expect(row.currentPeriodEnd!.getTime()).toBe(now.getTime() + 30 * day);
    expect(effectivePlan(row, new Date(now.getTime() + day))).toBe("pro");
    expect(effectivePlan(row, new Date(now.getTime() + 31 * day))).toBe("free");
    expect(renewsWithMollie(row)).toBe(false); // Evoly ne prélève pas ces jours offerts
    expect(await how(s.parrain.id)).toEqual({ how: "PRO_DAYS" });
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
    const mail = await db.emailMessage.findFirstOrThrow({
      where: { template: "referral.rewarded", toEmail: s.owner.email },
    });
    expect(mail.toEmail).toBe(s.owner.email);
    const html = (mail as unknown as { html?: string | null }).html;
    if (html) expect(html).not.toContain("<b>Club piégé</b>");
  });
});
