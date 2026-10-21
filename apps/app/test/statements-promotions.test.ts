import { describe, expect, it } from "vitest";
import { utcToZonedLocal } from "@evoly/core";
import { db } from "@/lib/db";
import { issueStatement } from "@/server/finances";
import { findPromotionFor, savePromotion, setPromotionActive } from "@/server/promotions";

// relevés de commissions (RG-FIN) : émission refusée hors période close ou sans commission ;
// offres commerciales de l'administration : création, modification, suspension, réactivation, recherche par le lien
const rid = () => Math.random().toString(36).slice(2, 10);
const refused = (code: string) => expect.objectContaining({ code });

describe("relevés de commissions : émission", () => {
  it("période mal écrite refusée ; mois en cours encore ouvert refusé ; mois sans commission : aucun relevé", async () => {
    const id = rid();
    const org = await db.organization.create({
      data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
    });
    await expect(issueStatement(org.id, "2026-1", "EUR")).rejects.toEqual(refused("NOT_FOUND"));
    const current = utcToZonedLocal(new Date(), "Europe/Brussels").slice(0, 7);
    await expect(issueStatement(org.id, current, "EUR")).rejects.toEqual(refused("STATEMENT_PERIOD_OPEN"));
    await expect(issueStatement(org.id, "2020-01", "EUR")).rejects.toEqual(refused("STATEMENT_EMPTY"));
    expect(await db.commissionStatement.count({ where: { organizationId: org.id } })).toBe(0);
  });
});

describe("offres commerciales : administration", () => {
  const input = (code: string, o: Record<string, unknown> = {}) => ({
    code,
    name: `Essai ${code}`,
    note: null,
    active: true,
    planId: "pro",
    durationValue: 2,
    durationUnit: "MONTH" as const,
    startsAt: null,
    endsAt: null,
    audience: "LINK" as const, // seulement par le lien : sans effet sur les organisations des autres tests
    countries: ["BE"],
    organizationTypes: [],
    sources: [],
    maxRedemptions: null,
    perOwnerLimit: 1,
    priority: 0,
    showOnSite: false,
    messages: { fr: { banner: "2 mois de Pro offerts", short: "2 mois offerts", cta: "Profiter de l’offre" } },
    ...o,
  });

  it("création, modification, suspension et réactivation inscrites à l'historique", async () => {
    const admin = await db.user.create({ data: { name: "Admin", email: `admin.${rid()}@exemple.be`, emailVerified: true } });
    const code = `essai-${rid()}`;
    const created = await savePromotion(admin.id, input(code));
    await savePromotion(admin.id, input(code, { name: "Essai renommé" }), created.id);
    expect((await db.promotion.findUniqueOrThrow({ where: { id: created.id } })).name).toBe("Essai renommé");
    await setPromotionActive(admin.id, created.id, false);
    await setPromotionActive(admin.id, created.id, true);
    const actions = (await db.auditLog.findMany({ where: { targetId: created.id }, orderBy: { createdAt: "asc" }, select: { action: true } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(["promotion.created", "promotion.updated", "promotion.suspended", "promotion.activated"]);
  });

  it("offre réservée au lien : trouvée seulement avec son code, active, et pour les pays visés", async () => {
    const admin = await db.user.create({ data: { name: "Admin", email: `admin.${rid()}@exemple.be`, emailVerified: true } });
    const user = await db.user.create({ data: { name: "Léa", email: `lea.${rid()}@exemple.be`, emailVerified: true } });
    const code = `essai-${rid()}`;
    const promo = await savePromotion(admin.id, input(code));
    const find = (over: Record<string, unknown> = {}) =>
      findPromotionFor(db, { userId: user.id, country: "BE", organizationType: "ASSOCIATION", offerCode: code, source: null, now: new Date(), ...over });
    expect((await find())?.id).toBe(promo.id);
    expect((await find({ offerCode: null }))?.id).not.toBe(promo.id);
    expect((await find({ country: "FR" }))?.id).not.toBe(promo.id);
    await setPromotionActive(admin.id, promo.id, false);
    expect((await find())?.id).not.toBe(promo.id);
  });
});
