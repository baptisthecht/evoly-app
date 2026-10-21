import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createEvent } from "@/server/events";
import { createPromo, deletePromo, setPromoActive } from "@/server/promos";

// codes promo d'un événement (US-PRM-01, RG-PRM-04) : format, réduction, tarifs, dates, doublon, activation, suppression
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
async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "Entrée", price: "12", quantity: 100 });
  const ticketTypeId = (await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })).id;
  return { ctx, org, event, ticketTypeId };
}
const promo = (o: Record<string, unknown> = {}) =>
  ({ code: "BIENVENUE", discountType: "PERCENT" as const, percent: "10", ticketTypeIds: [] as string[], unlocksHidden: false, ...o }) as never;
const refused = (code: string) => expect.objectContaining({ code });

describe("codes promo : création", () => {
  it("format : trop court ou caractères interdits refusés ; vide : code généré", async () => {
    const { ctx, event } = await setup();
    await expect(createPromo(ctx, event.id, promo({ code: "ab" }))).rejects.toEqual(refused("PROMO_CODE_FORMAT"));
    await expect(createPromo(ctx, event.id, promo({ code: "été 2027 !" }))).rejects.toEqual(refused("PROMO_CODE_FORMAT"));
    const generated = await createPromo(ctx, event.id, promo({ code: "" }));
    expect(generated.code).toMatch(/^[A-Z0-9_-]{3,32}$/);
  });

  it("réduction : pourcentage hors de 1 à 100 %, montant nul ou illisible refusés", async () => {
    const { ctx, event } = await setup();
    for (const percent of ["0", "150", "beaucoup"])
      await expect(createPromo(ctx, event.id, promo({ code: `P${rid()}`.toUpperCase(), percent }))).rejects.toEqual(refused("PROMO_PERCENT_INVALID"));
    for (const amount of ["0", "gratuit"])
      await expect(createPromo(ctx, event.id, promo({ code: `M${rid()}`.toUpperCase(), discountType: "AMOUNT", percent: null, amount }))).rejects.toEqual(
        refused("PROMO_AMOUNT_INVALID"),
      );
    expect(await createPromo(ctx, event.id, promo({ code: "DIXPOURCENT", percent: "10" }))).toMatchObject({ percentOffBps: 1000 });
  });

  it("tarif d'un autre événement introuvable ; fin avant le début refusée ; code déjà pris sur l'événement refusé", async () => {
    const { ctx, event } = await setup();
    const other = await setup();
    await expect(createPromo(ctx, event.id, promo({ ticketTypeIds: [other.ticketTypeId] }))).rejects.toEqual(refused("NOT_FOUND"));
    await expect(createPromo(ctx, event.id, promo({ startsAtLocal: "2027-03-10T10:00", expiresAtLocal: "2027-03-01T10:00" }))).rejects.toEqual(
      refused("PROMO_DATES_INVALID"),
    );
    await createPromo(ctx, event.id, promo({ code: "bienvenue" }));
    await expect(createPromo(ctx, event.id, promo({ code: "BIENVENUE" }))).rejects.toEqual(refused("PROMO_CODE_TAKEN"));
  });
});

describe("codes promo : activation et suppression", () => {
  it("code inconnu introuvable ; désactivation inscrite à l'historique ; code utilisé : suppression refusée, inutilisé : supprimé", async () => {
    const { ctx, org, event } = await setup();
    await expect(setPromoActive(ctx, event.id, "code-inconnu", false)).rejects.toEqual(refused("NOT_FOUND"));
    const used = await createPromo(ctx, event.id, promo({ code: "UTILISE" }));
    await setPromoActive(ctx, event.id, used.id, false);
    expect((await db.promoCode.findUniqueOrThrow({ where: { id: used.id } })).isActive).toBe(false);
    expect(await db.auditLog.count({ where: { organizationId: org.id, action: "promo.deactivated", targetId: used.id } })).toBe(1);
    await db.promoCode.update({ where: { id: used.id }, data: { usedCount: 3 } });
    await expect(deletePromo(ctx, event.id, used.id)).rejects.toEqual(refused("PROMO_USED"));
    const unused = await createPromo(ctx, event.id, promo({ code: "INUTILISE" }));
    await deletePromo(ctx, event.id, unused.id);
    expect(await db.promoCode.count({ where: { id: unused.id } })).toBe(0);
  });
});
