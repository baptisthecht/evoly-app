import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createAmbassador, removeAmbassadorPromo, setAmbassadorActive, setAmbassadorPromo, updateAmbassador } from "@/server/ambassadors";
import { findOrgContext } from "@/server/context";
import { addCustomDomain, removeCustomDomain } from "@/server/domains";
import { createEvent } from "@/server/events";
import { generatePresaleCodes as generateCodes, presaleCodeFor, savePresaleStart, setPresaleCodeActive } from "@/server/presale";

/** Données de génération complètes (code personnalisé et libellé absents par défaut). */
const generatePresaleCodes = (ctx: Parameters<typeof generateCodes>[0], eventId: string, input: Partial<Parameters<typeof generateCodes>[2]>) =>
  generateCodes(ctx, eventId, { quantity: 1, usesPerCode: 1, customCode: null, label: null, ...input });

// fonctions Pro : ambassadeurs (section 9.28), codes de prévente (RG-PRV), domaines personnalisés (US-BRD)
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Gala de printemps",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-18T02:00",
  timezone: "Europe/Brussels",
  locationType: "PHYSICAL" as const,
  locationName: "Salle des fêtes",
  city: "Mouscron",
  country: "BE",
};
async function setup(o: { pro?: boolean } = {}) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (o.pro !== false)
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) },
    });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "Entrée", price: "12", quantity: 100 });
  return { ctx, org, event, id };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("ambassadeurs", () => {
  it("offre gratuite refusée ; nom manquant, e-mail ou objectif invalides refusés ; code tiré du nom, e-mail en minuscules", async () => {
    const free = await setup({ pro: false });
    await expect(createAmbassador(free.ctx, free.event.id, { name: "Marie" })).rejects.toEqual(refused("FEATURE_UNAVAILABLE"));
    const { ctx, event } = await setup();
    await expect(createAmbassador(ctx, event.id, { name: "   " })).rejects.toEqual(refused("AMBASSADOR_NAME_REQUIRED"));
    await expect(createAmbassador(ctx, event.id, { name: "Marie", email: "pas-un-email" })).rejects.toEqual(refused("AMBASSADOR_EMAIL_INVALID"));
    for (const goal of ["0", "1.5", "200000"])
      await expect(createAmbassador(ctx, event.id, { name: "Marie", goal })).rejects.toEqual(refused("AMBASSADOR_GOAL_INVALID"));
    const a = await createAmbassador(ctx, event.id, { name: "Marie Dupont", email: " Marie@Exemple.BE ", goal: "25", reward: "Une place offerte" });
    expect(a).toMatchObject({ name: "Marie Dupont", email: "marie@exemple.be", goal: 25 });
    expect(a.code).toMatch(/^marie/);
    await expect(updateAmbassador(ctx, event.id, "ambassadeur-inconnu", { name: "Tom" })).rejects.toEqual(refused("NOT_FOUND"));
    await expect(setAmbassadorActive(ctx, event.id, "ambassadeur-inconnu", false)).rejects.toEqual(refused("NOT_FOUND"));
  });

  it("réduction associée au code : une seule fois, puis retirée ; ambassadeur inconnu introuvable", async () => {
    const { ctx, event } = await setup();
    const a = await createAmbassador(ctx, event.id, { name: "Tom Martin" });
    await expect(setAmbassadorPromo(ctx, event.id, "ambassadeur-inconnu", { discountType: "PERCENT", percent: "10" })).rejects.toEqual(refused("NOT_FOUND"));
    await setAmbassadorPromo(ctx, event.id, a.id, { discountType: "PERCENT", percent: "10" });
    expect(await db.promoCode.count({ where: { eventId: event.id, code: a.code.toUpperCase() } })).toBe(1);
    await expect(setAmbassadorPromo(ctx, event.id, a.id, { discountType: "AMOUNT", amount: "2" })).rejects.toEqual(refused("AMBASSADOR_PROMO_EXISTS"));
    await removeAmbassadorPromo(ctx, event.id, a.id);
    await expect(removeAmbassadorPromo(ctx, event.id, "ambassadeur-inconnu")).rejects.toEqual(refused("NOT_FOUND"));
  });
});

describe("codes de prévente", () => {
  it("quantités invalides ; code personnalisé : un seul, bien formé, unique ; génération", async () => {
    const { ctx, event } = await setup();
    await expect(generatePresaleCodes(ctx, event.id, { quantity: 0, usesPerCode: 1 })).rejects.toEqual(refused("INVALID_INPUT"));
    await expect(generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 0 })).rejects.toEqual(refused("INVALID_INPUT"));
    await expect(generatePresaleCodes(ctx, event.id, { quantity: 2, usesPerCode: 1, customCode: "VIP2027" })).rejects.toEqual(refused("INVALID_INPUT"));
    await expect(generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 1, customCode: "!" })).rejects.toEqual(refused("PRESALE_CODE_FORMAT"));
    expect(await generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 2, customCode: "VIP2027" })).toBe(1);
    await expect(generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 1, customCode: "vip2027" })).rejects.toEqual(refused("PRESALE_CODE_TAKEN"));
    expect(await generatePresaleCodes(ctx, event.id, { quantity: 3, usesPerCode: 1, label: "Partenaires" })).toBe(3);
    expect(await db.presaleCode.count({ where: { eventId: event.id } })).toBe(4);
  });

  it("code vide, inconnu, désactivé, épuisé ou avant le début de la prévente : refusé ; prévente après l'événement refusée", async () => {
    const { ctx, event } = await setup();
    await generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 1, customCode: "AMIS2027" });
    const row = await db.presaleCode.findFirstOrThrow({ where: { eventId: event.id } });
    const open = { id: event.id, presaleStartsAt: null };
    await expect(presaleCodeFor(db, open, "  ")).rejects.toEqual(refused("PRESALE_INVALID"));
    await expect(presaleCodeFor(db, open, "INCONNU")).rejects.toEqual(refused("PRESALE_INVALID"));
    await expect(presaleCodeFor(db, { id: event.id, presaleStartsAt: new Date(Date.now() + 86_400_000) }, "AMIS2027")).rejects.toEqual(
      refused("PRESALE_INVALID"),
    );
    expect((await presaleCodeFor(db, open, " amis2027 ")).id).toBe(row.id);
    await setPresaleCodeActive(ctx, event.id, row.id, false);
    await expect(presaleCodeFor(db, open, "AMIS2027")).rejects.toEqual(refused("PRESALE_INVALID"));
    await setPresaleCodeActive(ctx, event.id, row.id, true);
    await db.presaleCode.update({ where: { id: row.id }, data: { usedCount: 1 } });
    await expect(presaleCodeFor(db, open, "AMIS2027")).rejects.toEqual(refused("PRESALE_EXHAUSTED"));
    await expect(setPresaleCodeActive(ctx, event.id, "code-inconnu", false)).rejects.toEqual(refused("NOT_FOUND"));
    await expect(savePresaleStart(ctx, event.id, "2027-04-18T10:00")).rejects.toEqual(refused("PRESALE_AFTER_START"));
    await savePresaleStart(ctx, event.id, "2027-03-01T10:00");
    expect((await db.event.findUniqueOrThrow({ where: { id: event.id } })).presaleStartsAt).not.toBeNull();
    await savePresaleStart(ctx, event.id, null);
    expect((await db.event.findUniqueOrThrow({ where: { id: event.id } })).presaleStartsAt).toBeNull();
  });
});

describe("domaines personnalisés", () => {
  it("offre gratuite refusée ; domaine invalide ou d'Evoly refusé ; événement inconnu ; domaine pris ; nombre limité ; suppression d'un inconnu", async () => {
    const free = await setup({ pro: false });
    await expect(addCustomDomain(free.ctx, "billetterie.club.be", "ORGANIZATION")).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx, id } = await setup();
    await expect(addCustomDomain(ctx, "pas un domaine", "ORGANIZATION")).rejects.toEqual(refused("DOMAIN_INVALID"));
    await expect(addCustomDomain(ctx, "billets.evoly.me", "ORGANIZATION")).rejects.toEqual(refused("DOMAIN_RESERVED"));
    await expect(addCustomDomain(ctx, `gala-${id}.club.be`, "EVENT", "evenement-inconnu")).rejects.toEqual(refused("NOT_FOUND"));
    await addCustomDomain(ctx, `billetterie-${id}.club.be`, "ORGANIZATION");
    const other = await setup();
    await expect(addCustomDomain(other.ctx, `billetterie-${id}.club.be`, "ORGANIZATION")).rejects.toEqual(refused("DOMAIN_TAKEN"));
    let limited = false;
    for (let i = 0; i < 30 && !limited; i++) {
      try {
        await addCustomDomain(ctx, `d${i}-${id}.club.be`, "ORGANIZATION");
      } catch (err) {
        expect(err).toEqual(refused("DOMAIN_LIMIT"));
        limited = true;
      }
    }
    expect(limited).toBe(true);
    await expect(removeCustomDomain(ctx, "domaine-inconnu")).rejects.toEqual(refused("NOT_FOUND"));
  });
});
