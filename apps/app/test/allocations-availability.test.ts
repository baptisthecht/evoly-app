import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder } from "@/server/checkout";
import { sendComplimentaryTickets } from "@/server/complimentary";
import { findOrgContext } from "@/server/context";
import { createEvent, publishEvent } from "@/server/events";
import { joinWaitlist } from "@/server/waitlist";

// règle unique des places en vente (docs/COMPATIBILITE_RESEAUX.md) : les places confiées aux réseaux sont retirées de la vente
// en ligne, au niveau du tarif comme de la jauge ; partout où Evoly vend ou propose des places
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
/** Événement publié : un tarif gratuit (10 places, ou illimité), une part confiée à un réseau. */
async function setup(o: { quantity: number | null; allocated: number; capacity?: number }) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "Entrée", price: "0", quantity: o.quantity ?? 10 });
  const tt = await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } });
  await db.ticketType.update({ where: { id: tt.id }, data: { quantity: o.quantity, quantityAllocated: o.allocated } });
  if (o.capacity != null) await db.event.update({ where: { id: event.id }, data: { capacity: o.capacity } });
  await publishEvent(ctx, event.id);
  return { ctx, eventId: event.id, ticketTypeId: tt.id };
}
const reserve = (eventId: string, ticketTypeId: string, quantity: number) => reserveOrder({ eventId, lines: [{ ticketTypeId, quantity }], locale: "fr" });

describe("places en vente : contingents des réseaux", () => {
  it("panier : 10 places dont 8 confiées à un réseau, 2 seulement en ligne", async () => {
    const { eventId, ticketTypeId } = await setup({ quantity: 10, allocated: 8 });
    await expect(reserve(eventId, ticketTypeId, 3)).rejects.toThrow();
    await expect(reserve(eventId, ticketTypeId, 2)).resolves.toMatchObject({ token: expect.any(String) });
    await expect(reserve(eventId, ticketTypeId, 1)).rejects.toThrow(); // plus rien en ligne
  });

  it("jauge : les places confiées comptent aussi sur un tarif illimité", async () => {
    const { eventId, ticketTypeId } = await setup({ quantity: null, allocated: 9, capacity: 10 });
    await expect(reserve(eventId, ticketTypeId, 2)).rejects.toThrow();
    await expect(reserve(eventId, ticketTypeId, 1)).resolves.toMatchObject({ token: expect.any(String) });
  });

  it("liste d'attente : ouverte quand il ne reste que des places confiées ; fermée tant qu'une place est en ligne", async () => {
    const free = await setup({ quantity: 10, allocated: 9 });
    await expect(joinWaitlist(free.eventId, free.ticketTypeId, `a.${rid()}@exemple.be`, 1, "fr")).rejects.toMatchObject({ code: "WAITLIST_NOT_SOLD_OUT" });
    const full = await setup({ quantity: 10, allocated: 10 });
    await expect(joinWaitlist(full.eventId, full.ticketTypeId, `b.${rid()}@exemple.be`, 1, "fr")).resolves.toBeTruthy();
  });

  it("billets offerts : jamais pris sur les places confiées aux réseaux", async () => {
    const { ctx, eventId, ticketTypeId } = await setup({ quantity: 10, allocated: 8 });
    const results = await sendComplimentaryTickets(ctx, eventId, {
      ticketTypeId,
      recipients: [{ email: `invite.${rid()}@exemple.be`, firstName: "Léa", lastName: "Martin" }] as never,
      quantityEach: 3,
    });
    expect(results[0]).toMatchObject({ ok: false, error: "COMPLIMENTARY_NO_STOCK" });
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).quantitySold).toBe(0);
  });
});
