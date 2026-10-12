import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { cancelListingByOrganizer, getListingByCode, listingsForOrganizer, resaleShortUrl } from "@/server/resale";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("revente côté organisateur (US-RSL-05, RG-RSL-03)", () => {
  it("annonce retrouvée par son code et listée ; annulée par l'organisateur, tracée, jamais deux fois ; annonce réservée protégée", async () => {
    const id = rid();
    const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
    const org = await db.organization.create({
      data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
    });
    const event = await db.event.create({
      data: {
        organizationId: org.id,
        slug: `gala-${id}`,
        publicCode: id.toUpperCase().slice(0, 8),
        title: `Gala ${id}`,
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 20 * 86_400_000),
        status: "PUBLISHED",
        ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 10 } },
      },
      include: { ticketTypes: true },
    });
    const vendre = async (status: "ACTIVE" | "RESERVED") => {
      const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
      await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `v.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
      await finalizeOrder(r.orderId);
      const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: r.orderId } });
      return db.resaleListing.create({
        data: {
          eventId: event.id,
          ticketId: ticket.id,
          sellerOrderId: r.orderId,
          sellerEmail: `v.${rid()}@exemple.be`,
          linkCode: `code-${rid()}`,
          priceMinor: 1000,
          faceValueMinor: 1000,
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10 * 86_400_000),
          status,
          ...(status === "RESERVED" ? { reservedUntil: new Date(Date.now() + 15 * 60_000) } : {}),
        },
      });
    };
    const l = await vendre("ACTIVE");
    expect(resaleShortUrl(l.linkCode)).toMatch(new RegExp(`/r/${l.linkCode}$`));
    expect((await getListingByCode(l.linkCode))?.id).toBe(l.id);
    expect(JSON.stringify(await listingsForOrganizer(event.id))).toContain(l.id);
    await cancelListingByOrganizer(org.id, event.id, l.id, owner.id);
    expect((await db.resaleListing.findUniqueOrThrow({ where: { id: l.id } })).status).not.toBe("ACTIVE");
    expect(await db.auditLog.count({ where: { organizationId: org.id, action: "resale.cancelled_by_organizer" } })).toBe(1);
    await expect(cancelListingByOrganizer(org.id, event.id, l.id, owner.id)).rejects.toMatchObject({ code: "RESALE_NOT_ACTIVE" });
    const reservee = await vendre("RESERVED");
    await expect(cancelListingByOrganizer(org.id, event.id, reservee.id, owner.id)).rejects.toMatchObject({ code: "RESALE_RESERVED" });
    await expect(cancelListingByOrganizer(org.id, event.id, "annonce-inconnue", owner.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
