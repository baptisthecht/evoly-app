import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createEvent } from "@/server/events";
import { featuredSettings, saveFeatured } from "@/server/orgPage";
import {
  featuredOf,
  loadPublicEvent,
  publicEventCards,
} from "@/server/publicEvents";

// vitrine de l'organisateur : prix « dès » et places restantes, d'après la règle de la page de l'événement
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Gala",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-17T23:00",
  timezone: "Europe/Paris",
  locationType: "PHYSICAL" as const,
  locationName: "Cabaret",
  city: "Paris",
  country: "FR",
};
async function published(price = "0", quantity: number | null = 100) {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille Dupont",
      email: `own.${id}@exemple.fr`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Cabaret ${id}`,
      slug: `cab-${id}`,
      subdomain: `cab-${id}`,
      country: "FR",
      currency: "EUR",
      timezone: "Europe/Paris",
      locale: "fr",
    },
  });
  const role = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: role.id,
      status: "ACTIVE",
    },
  });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  const event = await createEvent(ctx, essentials, {
    name: "Réduit",
    price,
    quantity: quantity ?? 100,
  });
  await db.event.update({
    where: { id: event.id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  const first = await db.ticketType.findFirstOrThrow({
    where: { eventId: event.id },
  });
  if (quantity === null)
    await db.ticketType.update({
      where: { id: first.id },
      data: { quantity: null },
    });
  return { eventId: event.id, first, ctx };
}
async function addType(
  base: { id: string },
  data: {
    name: string;
    priceMinor: number;
    quantity: number;
    quantitySold: number;
  },
) {
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    ...rest
  } = await db.ticketType.findUniqueOrThrow({ where: { id: base.id } });
  return db.ticketType.create({
    data: { ...rest, ...data, quantityHeld: 0, quantityAllocated: 0 },
  });
}

describe("vitrine : prix « dès » et places restantes", () => {
  it("places restantes ; « dès » sur les seuls tarifs encore en vente ; tout vendu : complet", async () => {
    const { eventId, first } = await published("8", 100);
    await db.ticketType.update({
      where: { id: first.id },
      data: { quantitySold: 90 },
    });
    await addType(first, {
      name: "Gratuit invité",
      priceMinor: 0,
      quantity: 5,
      quantitySold: 5,
    });
    let card = (await publicEventCards([{ id: eventId }])).get(eventId)!;
    expect(card).toMatchObject({
      fromPriceMinor: 800,
      remaining: 10,
      soldOut: false,
      currency: "EUR",
    });
    await db.ticketType.update({
      where: { id: first.id },
      data: { quantitySold: 100 },
    });
    card = (await publicEventCards([{ id: eventId }])).get(eventId)!;
    expect([card.soldOut, card.remaining]).toEqual([true, 0]);
    expect(card.soldOut).toBe(
      (await loadPublicEvent({ id: eventId }))!.soldOut,
    ); // même règle que la page
  });

  it("jauge plus petite que la somme des tarifs : jamais au-delà ; places illimitées : rien d'annoncé", async () => {
    const { eventId, first } = await published("10", 100);
    await addType(first, {
      name: "Plein",
      priceMinor: 2500,
      quantity: 100,
      quantitySold: 0,
    });
    await db.event.update({ where: { id: eventId }, data: { capacity: 50 } });
    expect(
      (await publicEventCards([{ id: eventId }])).get(eventId)!.remaining,
    ).toBe(50);
    const unlimited = await published("0", null);
    expect(
      (await publicEventCards([{ id: unlimited.eventId }])).get(
        unlimited.eventId,
      ),
    ).toMatchObject({ remaining: null, fromPriceMinor: 0 });
  });
});

describe("vitrine : événement mis en avant", () => {
  const events = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("aucun : tout dans « À l'affiche » ; le prochain ; un choisi ; choisi introuvable : le prochain, signalé", () => {
    expect(featuredOf("NONE", null, events)).toEqual({
      featured: null,
      rest: events,
      fallback: false,
    });
    expect(featuredOf("NEXT", null, events)).toEqual({
      featured: { id: "a" },
      rest: [{ id: "b" }, { id: "c" }],
      fallback: false,
    });
    expect(featuredOf("CHOSEN", "b", events)).toEqual({
      featured: { id: "b" },
      rest: [{ id: "a" }, { id: "c" }],
      fallback: false,
    });
    expect(featuredOf("CHOSEN", "z", events)).toEqual({
      featured: { id: "a" },
      rest: [{ id: "b" }, { id: "c" }],
      fallback: true,
    });
    expect(featuredOf("NEXT", null, [])).toEqual({
      featured: null,
      rest: [],
      fallback: false,
    });
  });

  it("enregistrement : un événement public à venir de l'organisation, jamais celui d'une autre ; « aucun » efface le choix", async () => {
    const mine = await published("0", 100);
    const other = await published("0", 100);
    await expect(
      saveFeatured(mine.ctx, { mode: "CHOSEN", eventId: other.eventId }),
    ).rejects.toMatchObject({ code: "FEATURED_EVENT_INVALID" });
    await saveFeatured(mine.ctx, { mode: "CHOSEN", eventId: mine.eventId });
    expect(await featuredSettings(mine.ctx)).toMatchObject({
      mode: "CHOSEN",
      eventId: mine.eventId,
      fallback: false,
    });
    await db.event.update({
      where: { id: mine.eventId },
      data: { status: "DRAFT" },
    });
    expect((await featuredSettings(mine.ctx)).fallback).toBe(true); // plus public : le prochain, signalé
    await saveFeatured(mine.ctx, { mode: "NONE", eventId: mine.eventId });
    expect(await featuredSettings(mine.ctx)).toMatchObject({
      mode: "NONE",
      eventId: null,
    });
  });
});
