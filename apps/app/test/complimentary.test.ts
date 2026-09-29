import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { sendComplimentaryTickets } from "@/server/complimentary";
import type { OrgContext } from "@/server/context";
import { searchOrders } from "@/server/ordersAdmin";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(quantity: number) {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const event = await db.event.create({ data: { organizationId: org.id, slug: `gala-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Gala ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 5 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: [{ name: "Invité", priceMinor: 3500, currency: "EUR", quantity, sortOrder: 0 }, { name: "Presse", priceMinor: 0, currency: "EUR", quantity: 20, sortOrder: 1 }] } }, include: { ticketTypes: { orderBy: { sortOrder: "asc" } } } });
  const ctx = { organization: { id: org.id, locale: "fr" }, user: { id: user.id } } as unknown as OrgContext;
  return { id, org, event, ctx, invite: event.ticketTypes[0]!, press: event.ticketTypes[1]! };
}

describe("billets offerts (US-ORD-03)", () => {
  it("une commande offerte par invité : 0 €, sans commission, décomptée de la jauge, e-mail envoyé", async () => {
    const s = await setup(3);
    const r = await sendComplimentaryTickets(s.ctx, s.event.id, { ticketTypeId: s.invite.id, quantityEach: 1, recipients: [{ email: `lea.${s.id}@exemple.be`, firstName: "Léa", lastName: "Martin" }, { email: `tom.${s.id}@exemple.be`, firstName: null, lastName: null }] });
    expect(r.every((x) => x.ok)).toBe(true);
    const orders = await db.order.findMany({ where: { eventId: s.event.id }, include: { tickets: true } });
    expect(orders.map((o) => [o.source, o.status, o.totalMinor, o.applicationFeeMinor, o.tickets.length])).toEqual([["COMPLIMENTARY", "PAID", 0, 0, 1], ["COMPLIMENTARY", "PAID", 0, 0, 1]]);
    expect(orders.find((o) => o.buyerEmail.startsWith("tom."))?.buyerFirstName).toBe("Tom");
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: s.invite.id } })).quantitySold).toBe(2);
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "order.confirmation" } })).toBe(2);
    expect(await db.contact.count({ where: { organizationId: s.org.id, marketingConsent: true } })).toBe(0);
    expect((await searchOrders(s.ctx, { eventId: s.event.id, ticketTypeId: s.invite.id })).total).toBe(2);
    expect((await searchOrders(s.ctx, { eventId: s.event.id, ticketTypeId: s.press.id })).total).toBe(0);
  });

  it("jauge atteinte en cours d'envoi : envoi partiel rapporté ; événement annulé refusé", async () => {
    const s = await setup(1);
    const r = await sendComplimentaryTickets(s.ctx, s.event.id, { ticketTypeId: s.invite.id, quantityEach: 1, recipients: [{ email: `a.${s.id}@exemple.be`, firstName: "A", lastName: null }, { email: `b.${s.id}@exemple.be`, firstName: "B", lastName: null }] });
    expect(r.map((x) => (x.ok ? "ok" : x.error))).toEqual(["ok", "COMPLIMENTARY_NO_STOCK"]);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: s.invite.id } })).quantityHeld).toBe(0);
    await db.event.update({ where: { id: s.event.id }, data: { status: "CANCELLED" } });
    await expect(sendComplimentaryTickets(s.ctx, s.event.id, { ticketTypeId: s.press.id, quantityEach: 1, recipients: [{ email: `c.${s.id}@exemple.be`, firstName: null, lastName: null }] })).rejects.toThrow("COMPLIMENTARY_EVENT_CLOSED");
  });
});
