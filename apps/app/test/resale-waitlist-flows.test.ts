import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelReservation, reserveOrder, submitBuyer } from "@/server/checkout";
import { createListing, reserveResale } from "@/server/resale";
import { blockedForPublic, joinWaitlist, leaveWaitlist, waitlistByToken, waitlistCounts, waitlistOfferView } from "@/server/waitlist";

// revente côté acheteur (réservation d'une annonce) et liste d'attente (blocage du public, offres, désinscription)
const rid = () => Math.random().toString(36).slice(2, 10);
const buyer = (email: string) => ({ firstName: "Léa", lastName: "Martin", email, marketingOptIn: false });
async function event(o: { quantity?: number } = {}) {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const e = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      resaleEnabled: true,
      resaleCutoffMinutes: 120,
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: o.quantity ?? 100, sortOrder: 0, resaleAllowed: true }] },
    },
    include: { ticketTypes: true },
  });
  return { event: e, ticketTypeId: e.ticketTypes[0]!.id, id };
}
async function listed() {
  const { event: e, ticketTypeId, id } = await event();
  const r = await reserveOrder({ eventId: e.id, lines: [{ ticketTypeId, quantity: 1 }], locale: "fr" });
  await submitBuyer(r.token, buyer(`vendeur.${id}@exemple.be`));
  const ticket = await db.ticket.findFirstOrThrow({ where: { eventId: e.id } });
  const listing = await createListing(r.token, ticket.id, "0");
  return { listing: await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } }), ticket };
}
const refused = (code: string) => expect.objectContaining({ code });
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

describe("revente : réservation d'une annonce", () => {
  it("annonce inconnue : introuvable", async () => {
    await expect(reserveResale("annonce-inconnue", "fr")).rejects.toEqual(refused("NOT_FOUND"));
  });

  it("réservée : indisponible pour un second acheteur ; réservation expirée : de nouveau disponible ; rendue : remise en vente", async () => {
    const { listing } = await listed();
    const first = await reserveResale(listing.linkCode, "fr");
    expect((await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("RESERVED");
    await expect(reserveResale(listing.linkCode, "fr")).rejects.toEqual(refused("RESALE_RESERVED"));
    await expect(reserveResale(listing.linkCode, "fr", later(24 * 60))).resolves.toBeTruthy(); // l'ancienne réservation a expiré
    const again = await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(again.status).toBe("RESERVED");
    await cancelReservation(first.token); // commande déjà détachée de l'annonce : sans effet sur elle
    expect((await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("RESERVED");
  });

  it("acheteur qui renonce : l'annonce revient en vente", async () => {
    const { listing } = await listed();
    const r = await reserveResale(listing.linkCode, "fr");
    await cancelReservation(r.token);
    expect(await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "ACTIVE", reservedUntil: null });
  });

  it("annonce expirée : refusée ; billet qui n'est plus valable : indisponible", async () => {
    const a = await listed();
    await db.resaleListing.update({ where: { id: a.listing.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await expect(reserveResale(a.listing.linkCode, "fr")).rejects.toEqual(refused("RESALE_EXPIRED"));
    const b = await listed();
    await db.ticket.update({ where: { id: b.ticket.id }, data: { status: "CHECKED_IN" } });
    await expect(reserveResale(b.listing.linkCode, "fr")).rejects.toEqual(refused("RESALE_UNAVAILABLE"));
  });
});

describe("liste d'attente : inscrits, offres, désinscription", () => {
  it("tarif bloqué pour le public tant que des inscrits attendent ; comptages ; offre visible seulement en cours ; désinscription", async () => {
    const { event: e, ticketTypeId, id } = await event({ quantity: 1 });
    const r = await reserveOrder({ eventId: e.id, lines: [{ ticketTypeId, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, buyer(`premier.${id}@exemple.be`));
    const entry = await joinWaitlist(e.id, ticketTypeId, `attente.${id}@exemple.be`, 2, "fr");
    expect((await blockedForPublic(db, [ticketTypeId], new Date())).has(ticketTypeId)).toBe(true);
    expect(await waitlistCounts(e.id)).toEqual([expect.objectContaining({ ticketTypeId, _count: { _all: 1 }, _sum: { quantity: 2 } })]);
    expect((await waitlistByToken(entry.token))?.event.title).toBe(e.title);
    expect(await waitlistOfferView(entry.token, e.id)).toBeNull(); // en attente : aucune offre
    await db.waitlistEntry.update({ where: { id: entry.id }, data: { status: "OFFERED", offeredQuantity: 1, offerExpiresAt: later(30) } });
    expect(await waitlistOfferView(entry.token, e.id)).toMatchObject({ token: entry.token, ticketTypeId, quantity: 1 });
    expect(await waitlistOfferView(entry.token, e.id, later(60))).toBeNull(); // offre expirée
    await leaveWaitlist(entry.token);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("CANCELLED");
    expect((await blockedForPublic(db, [ticketTypeId], new Date())).has(ticketTypeId)).toBe(false);
  });
});
