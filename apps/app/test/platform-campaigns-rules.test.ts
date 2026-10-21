import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveCampaign, scheduleCampaign, unscheduleCampaign } from "@/server/campaigns";
import { findOrgContext } from "@/server/context";
import { assignPlan, extendTrial, setFeatureFlag } from "@/server/platform";

// administration d'Evoly (essai, offre, options activables) et campagnes e-mail (RG-MKT) : règles refusées
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(o: { pro?: boolean; sub?: Record<string, unknown> } = {}) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (o.pro || o.sub)
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000), ...(o.sub ?? {}) } as never,
    });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  // membre de l'équipe Evoly : son compte est dans « user »
  const staff = { user: { id: owner.id, email: owner.email, name: owner.name }, role: "ADMIN", level: "ADMIN", platformRole: "ADMIN" } as never;
  return { ctx, org, staff };
}
const refused = (code: string) => expect.objectContaining({ code });
const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bonjour à toutes et à tous" }] }] };
const campaign = (o: Record<string, unknown> = {}) => ({
  name: "Rentrée",
  subject: "Le gala approche",
  content: doc,
  segment: { kind: "ALL_CONSENTING", locale: null },
  ...o,
});

describe("administration : essai et offre", () => {
  it("essai : de 1 à 90 jours seulement ; offre : date invalide ou passée refusée ; abonnement Stripe en cours : résiliation explicite exigée", async () => {
    const { org, staff } = await setup();
    for (const days of [0, 91, 1.5]) await expect(extendTrial(staff, org.id, days)).rejects.toEqual(refused("TRIAL_DAYS_INVALID"));
    await expect(assignPlan(staff, org.id, "pro", new Date("pas une date"))).rejects.toEqual(refused("PLAN_UNTIL_INVALID"));
    await expect(assignPlan(staff, org.id, "pro", new Date(Date.now() - 86_400_000))).rejects.toEqual(refused("PLAN_UNTIL_PAST"));
    const paying = await setup({ sub: { stripeSubscriptionId: `sub_${rid()}`, stripeCustomerId: `cus_${rid()}` } });
    await expect(assignPlan(paying.staff, paying.org.id, "partner", null)).rejects.toEqual(refused("PLAN_MANAGED_BY_STRIPE"));
  });
});

describe("administration : options activables", () => {
  it("nom vide refusé ; nom nettoyé ; réglage mis à jour sans doublon", async () => {
    const { org, staff } = await setup();
    await expect(setFeatureFlag(staff, "  !!! ", org.id, true)).rejects.toEqual(refused("FLAG_KEY_INVALID"));
    const key = `caisse_${rid()}`;
    await setFeatureFlag(staff, `  ${key.toUpperCase()} !`, org.id, true);
    await setFeatureFlag(staff, key, org.id, false);
    const rows = await db.featureFlag.findMany({ where: { key, organizationId: org.id } });
    expect(rows.map((r) => r.enabled)).toEqual([false]);
  });
});

describe("campagnes e-mail", () => {
  it("offre gratuite refusée ; contenu vide ou ciblage invalide refusés ; sans destinataire, pas de programmation ; brouillon : rien à déprogrammer", async () => {
    const free = await setup();
    await expect(saveCampaign(free.ctx, campaign())).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx } = await setup({ pro: true });
    await expect(saveCampaign(ctx, campaign({ content: { type: "doc", content: [] } }))).rejects.toEqual(refused("CAMPAIGN_CONTENT_INVALID"));
    await expect(saveCampaign(ctx, campaign({ segment: { kind: "TOUT_LE_MONDE" } }))).rejects.toEqual(refused("CAMPAIGN_SEGMENT_INVALID"));
    const c = await saveCampaign(ctx, campaign());
    await expect(scheduleCampaign(ctx, c.id, new Date(Date.now() + 86_400_000))).rejects.toEqual(refused("CAMPAIGN_NO_RECIPIENTS"));
    await expect(unscheduleCampaign(ctx, c.id)).rejects.toEqual(refused("CAMPAIGN_NOT_SCHEDULED"));
  });

  it("campagne envoyée : plus modifiable ni reprogrammable", async () => {
    const { ctx } = await setup({ pro: true });
    const c = await saveCampaign(ctx, campaign());
    await db.emailCampaign.update({ where: { id: c.id }, data: { status: "SENT" } });
    await expect(saveCampaign(ctx, campaign({ id: c.id, subject: "Nouveau sujet" }))).rejects.toEqual(refused("CAMPAIGN_LOCKED"));
    await expect(scheduleCampaign(ctx, c.id, null)).rejects.toEqual(refused("CAMPAIGN_LOCKED"));
  });
});
