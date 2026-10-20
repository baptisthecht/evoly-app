import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { GET } from "@/app/api/public/offer/route";
import { createOrganization } from "@/server/onboarding";
import { parsePromotionForm } from "@/server/promotionForm";
import { promotionStats, publicOffer } from "@/server/promotions";

// offres suspendues à la fin : sinon les organisations créées par les autres tests naîtraient en Pro
afterAll(async () => {
  await db.promotion.updateMany({ data: { active: false } });
});
const rid = () => Math.random().toString(36).slice(2, 8);
const day = 86_400_000;
/** Chaque test a ses propres offres (code unique) ; celles des autres tests sont suspendues pour ne pas interférer. */
async function offer(over: Record<string, unknown> = {}) {
  await db.promotion.updateMany({ data: { active: false } });
  return db.promotion.create({
    data: {
      code: `t-${rid()}`,
      name: "Test",
      messages: { fr: { banner: "3 mois offerts", short: "Offert", cta: "En profiter" }, en: { banner: "3 months free", short: "Free", cta: "Get it" } },
      ...over,
    } as never,
  });
}
const user = () => db.user.create({ data: { name: "Nora", email: `promo.${rid()}@exemple.be`, emailVerified: true } });
const create = async (userId: string, over: { type?: string; country?: string } = {}, offerCode?: string | null, source?: string) =>
  createOrganization(
    userId,
    { name: "Club", subdomain: `club-${rid()}`, country: over.country ?? "BE", type: over.type ?? "ASSOCIATION" } as never,
    source
      ? ({ source, medium: "cpc", campaign: null, term: null, content: null, referrer: null, landing: "/", firstAt: new Date().toISOString() } as never)
      : null,
    offerCode ?? null,
  );
const planOf = async (organizationId: string) => db.subscription.findUniqueOrThrow({ where: { organizationId } });

describe("offres attribuées à la création d'une organisation (docs/OFFRES.md)", () => {
  it("toute nouvelle organisation : Pro pour la durée de l'offre, une seule fois, puis Free tout seul", async () => {
    const p = await offer({ durationValue: 30, durationUnit: "DAY" });
    const org = await create((await user()).id);
    const sub = await planOf(org.id);
    expect([sub.planId, sub.status, sub.stripeSubscriptionId]).toEqual(["pro", "ACTIVE", null]);
    expect(Math.round((sub.currentPeriodEnd!.getTime() - Date.now()) / day)).toBe(30);
    expect(await db.promotionRedemption.count({ where: { promotionId: p.id, organizationId: org.id } })).toBe(1);
    expect((await db.promotion.findUniqueOrThrow({ where: { id: p.id } })).redeemedCount).toBe(1);
  });

  it("offre de campagne : seulement avec son code", async () => {
    const p = await offer({ audience: "LINK" });
    expect((await planOf((await create((await user()).id)).id)).planId).toBe("free");
    expect((await planOf((await create((await user()).id, {}, p.code.toUpperCase())).id)).planId).toBe("pro");
  });

  it("conditions de pays, de type d'organisation et de source de la visite", async () => {
    await offer({ countries: ["BE"], organizationTypes: ["ASSOCIATION"], sources: ["google"] });
    const u = async () => (await user()).id;
    expect((await planOf((await create(await u(), {}, null, "google")).id)).planId).toBe("pro");
    expect((await planOf((await create(await u(), { type: "COMPANY" }, null, "google")).id)).planId).toBe("free");
    expect((await planOf((await create(await u(), {}, null, "newsletter")).id)).planId).toBe("free");
    expect((await planOf((await create(await u())).id)).planId).toBe("free"); // source inconnue
  });

  it("plafond jamais dépassé, même pour des créations simultanées", async () => {
    const p = await offer({ maxRedemptions: 2 });
    const users = await Promise.all([user(), user(), user(), user()]);
    const orgs = await Promise.all(users.map((u) => create(u.id)));
    const plans = await Promise.all(orgs.map((o) => planOf(o.id)));
    expect(plans.filter((s) => s.planId === "pro")).toHaveLength(2);
    expect((await db.promotion.findUniqueOrThrow({ where: { id: p.id } })).redeemedCount).toBe(2);
  });

  it("limite par organisateur : la deuxième organisation du même organisateur n'en profite pas", async () => {
    await offer({ perOwnerLimit: 1 });
    const u = await user();
    expect((await planOf((await create(u.id)).id)).planId).toBe("pro");
    expect((await planOf((await create(u.id)).id)).planId).toBe("free");
  });

  it("priorité : la plus haute l'emporte", async () => {
    await offer({ code: `basse-${rid()}`, priority: 0, durationValue: 1, durationUnit: "MONTH" });
    const high = await db.promotion.create({ data: { code: `haute-${rid()}`, name: "Haute", priority: 10, durationValue: 6, durationUnit: "MONTH" } });
    const org = await create((await user()).id);
    expect((await db.promotionRedemption.findUniqueOrThrow({ where: { organizationId: org.id } })).promotionId).toBe(high.id);
  });

  it("suspendue, programmée ou terminée : jamais attribuée", async () => {
    for (const over of [{ active: false }, { startsAt: new Date(Date.now() + day) }, { endsAt: new Date(Date.now() - day) }]) {
      await offer(over);
      expect((await planOf((await create((await user()).id)).id)).planId).toBe("free");
    }
  });
});

describe("textes publics, statistiques et formulaire de l'administration", () => {
  it("offre publique dans la langue du visiteur ; point d'accès ouvert au site vitrine", async () => {
    const p = await offer();
    expect((await publicOffer("en"))!.banner).toBe("3 months free");
    expect((await publicOffer("nl"))!.banner).toBe("3 mois offerts"); // repli sur le français
    const res = await GET(new Request(`https://app.evoly.me/api/public/offer?lang=en&offre=${p.code}`));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(((await res.json()) as { offer: { code: string; cta: string } }).offer).toMatchObject({ code: p.code, cta: "Get it" });
    await db.promotion.update({ where: { id: p.id }, data: { showOnSite: false } });
    expect(await publicOffer("fr")).toBeNull();
  });

  it("statistiques : bénéficiaires, encore sous l'offre, publication", async () => {
    const p = await offer();
    const org = await create((await user()).id);
    await db.event.create({
      data: {
        organizationId: org.id,
        slug: `e-${rid()}`,
        publicCode: rid().toUpperCase(),
        title: "Gala",
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 30 * day),
        status: "PUBLISHED",
      },
    });
    const row = (await promotionStats()).find((r) => r.id === p.id)!;
    expect([row.status, row.redemptions, row.stillOffered, row.published, row.firstSale, row.paidPro]).toEqual([
      "DISABLED" === row.status ? "DISABLED" : "RUNNING",
      1,
      1,
      1,
      0,
      0,
    ]);
  });

  it("formulaire : code, période, durée, pays et bandeau français contrôlés ; heures de Bruxelles converties", () => {
    const form = (over: Record<string, string> = {}, types: string[] = []) => {
      const f = new FormData();
      const base: Record<string, string> = {
        code: "Rentree-2027",
        name: "Rentrée",
        planId: "pro",
        durationValue: "3",
        durationUnit: "MONTH",
        startsAtLocal: "2027-09-01T00:00",
        endsAtLocal: "2027-09-30T23:59",
        audience: "LINK",
        countries: "be, lu",
        sources: "Google",
        maxRedemptions: "",
        perOwnerLimit: "1",
        priority: "0",
        active: "on",
        showOnSite: "on",
        msg_fr_banner: "3 mois offerts",
        ...over,
      };
      for (const [k, v] of Object.entries(base)) f.set(k, v);
      for (const t of types) f.append("organizationTypes", t);
      return f;
    };
    const ok = parsePromotionForm(form({}, ["ASSOCIATION"]));
    expect(ok.ok && ok.data).toMatchObject({
      code: "rentree-2027",
      countries: ["BE", "LU"],
      sources: ["google"],
      organizationTypes: ["ASSOCIATION"],
      maxRedemptions: null,
      startsAt: new Date("2027-08-31T22:00:00Z"),
    });
    const bad = parsePromotionForm(form({ code: "x", endsAtLocal: "2027-08-01T00:00", countries: "Belgique", durationValue: "40", msg_fr_banner: "" }));
    expect(bad.ok ? {} : bad.fields).toMatchObject({
      code: "validation.code",
      endsAtLocal: "validation.endBeforeStart",
      countries: "validation.invalid",
      durationValue: "validation.number",
      msg_fr_banner: "validation.required",
    });
  });
});
