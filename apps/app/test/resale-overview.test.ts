import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { organizationResaleOverview } from "@/server/resale";

describe("vue d'ensemble des reventes de l'organisation (US-RSL-05)", () => {
  it("chiffres de toutes les annonces, événements à venir ou avec annonces, dernières annonces", async () => {
    const id = Math.random().toString(36).slice(2, 10);
    const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
    const mk = (slug: string, days: number, resaleEnabled = true) => db.event.create({ data: { organizationId: org.id, slug: `${slug}-${id}`, publicCode: `${slug.slice(0, 2)}${id}`.toUpperCase().slice(0, 8), title: `${slug} ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + days * 86_400_000), status: "PUBLISHED", resaleEnabled, ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50 } } }, include: { ticketTypes: true } });
    const gala = await mk("gala", 10);
    await mk("bal", 20, false);
    // vraie commande, par le parcours d'achat : trois billets
    const r = await reserveOrder({ eventId: gala.id, lines: [{ ticketTypeId: gala.ticketTypes[0]!.id, quantity: 3 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false });
    const tickets = await db.ticket.findMany({ where: { orderId: r.orderId }, orderBy: { createdAt: "asc" } });
    expect(tickets).toHaveLength(3);
    const statuses = ["ACTIVE", "SOLD", "FAILED"] as const;
    for (const [i, status] of statuses.entries())
      await db.resaleListing.create({ data: { eventId: gala.id, ticketId: tickets[i]!.id, sellerOrderId: r.orderId, sellerEmail: `lea.${id}@exemple.be`, linkCode: `l${id}${i}`, priceMinor: 1800, faceValueMinor: 2000, currency: "EUR", status, expiresAt: new Date(Date.now() + 9 * 86_400_000) } });

    const o = await organizationResaleOverview(org.id);
    expect(o.totals).toEqual({ open: 1, sold: 1, amountMinor: 1800, failed: 1 });
    expect(o.recent.map((l) => l.status).sort()).toEqual(["ACTIVE", "FAILED", "SOLD"]);
    expect(o.events.map((e) => [e.title, e.resaleEnabled, e.open, e.sold])).toEqual([[`bal ${id}`, false, 0, 0], [`gala ${id}`, true, 1, 1]]);
  });
});
