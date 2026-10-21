import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createEvent } from "@/server/events";

// règles de création d'un événement : prix, fuseau horaire, dates, lieu physique ou en ligne
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
const ticket = { name: "Entrée", price: "0" };
async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  return { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("création d'un événement : règles refusées", () => {
  it("prix sous le minimum, prix illisible, fuseau horaire inconnu, fin avant le début", async () => {
    const ctx = await setup();
    await expect(createEvent(ctx, essentials, { name: "Entrée", price: "0,20" })).rejects.toEqual(refused("PRICE_BELOW_MINIMUM"));
    await expect(createEvent(ctx, essentials, { name: "Entrée", price: "douze" })).rejects.toEqual(refused("INVALID_PRICE"));
    await expect(createEvent(ctx, { ...essentials, timezone: "Mars/Olympus_Mons" }, ticket)).rejects.toEqual(refused("INVALID_TIMEZONE"));
    await expect(createEvent(ctx, { ...essentials, endsAtLocal: "2027-04-17T19:00" }, ticket)).rejects.toEqual(refused("END_BEFORE_START"));
  });
});

describe("création d'un événement : lieu", () => {
  it("sur place sans lieu ni adresse : refusé", async () => {
    const ctx = await setup();
    await expect(createEvent(ctx, { ...essentials, locationName: " ", addressLine1: null }, ticket)).rejects.toEqual(refused("LOCATION_REQUIRED"));
  });

  it("en ligne : lien exigé, et sécurisé (https) ; un événement en ligne ne garde aucune adresse", async () => {
    const ctx = await setup();
    const online = { ...essentials, locationType: "ONLINE" as const };
    await expect(createEvent(ctx, { ...online, onlineUrl: null }, ticket)).rejects.toEqual(refused("ONLINE_URL_REQUIRED"));
    await expect(createEvent(ctx, { ...online, onlineUrl: "http://exemple.be/salle" }, ticket)).rejects.toEqual(refused("ONLINE_URL_INVALID"));
    await createEvent(ctx, { ...online, onlineUrl: "  https://exemple.be/salle  " }, ticket);
    const saved = await db.event.findFirstOrThrow({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" } });
    expect(saved).toMatchObject({ onlineUrl: "https://exemple.be/salle", locationName: null, city: null, country: null });
  });
});
