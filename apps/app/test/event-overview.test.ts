import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { eventOverview, parsePeriod } from "@/server/eventOverview";
import { createOrganization } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 8);
const DAY = 86_400_000;
async function eventWithOrders() {
  const u = await db.user.create({ data: { name: "Nora", email: `vue.${rid()}@exemple.be`, emailVerified: true } });
  const org = await createOrganization(u.id, { name: "Club", subdomain: `club-${rid()}`, country: "BE", type: "ASSOCIATION" } as never);
  const e = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `e-${rid()}`,
      publicCode: rid().toUpperCase(),
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * DAY),
      status: "PUBLISHED",
    },
  });
  const normal = await db.ticketType.create({ data: { eventId: e.id, name: "Normal", priceMinor: 1000, currency: "EUR", quantity: 100, quantitySold: 5 } });
  await db.ticketType.create({ data: { eventId: e.id, name: "Soutien", priceMinor: 2500, currency: "EUR", quantity: null } });
  const order = async (status: "PAID" | "REFUNDED" | "PENDING", qty: number, totalMinor: number, netMinor: number | null, daysAgo: number, first = "Léa") =>
    db.order.create({
      data: {
        reference: `EVO-${rid()}`,
        organizationId: org.id,
        eventId: e.id,
        buyerEmail: `${rid()}@exemple.be`,
        buyerFirstName: first,
        buyerLastName: "Martin",
        currency: "EUR",
        subtotalMinor: totalMinor,
        totalMinor,
        netMinor,
        status,
        paidAt: status === "PENDING" ? null : new Date(Date.now() - daysAgo * DAY),
        feeSnapshot: {},
        accessTokenHash: rid(),
        items: { create: [{ ticketTypeId: normal.id, quantity: qty, unitPriceMinor: 1000 }] },
      },
    });
  await order("PAID", 2, 2000, 1800, 0);
  await order("PAID", 3, 3000, null, 10, "Tom");
  await order("REFUNDED", 1, 1000, 900, 2, "Zoé");
  await order("PENDING", 4, 4000, null, 0);
  return e;
}

describe("vue d'ensemble d'un événement : chiffres", () => {
  it("recette nette (montant net, sinon total), semaine, commandes, panier moyen ; capacité vide si un tarif est illimité", async () => {
    const e = await eventWithOrders();
    const o = await eventOverview(e.id, "Europe/Brussels", "14");
    expect([o.netMinor, o.weekNetMinor, o.ordersCount, o.averageBasketMinor, o.ticketsSold, o.capacity]).toEqual([4800, 1800, 2, 2500, 5, null]);
  });

  it("ventes par jour dans le fuseau de l'événement : 7, 14 jours, ou depuis la première vente", async () => {
    const e = await eventWithOrders();
    const d14 = await eventOverview(e.id, "Europe/Brussels", "14");
    expect(d14.days).toHaveLength(14);
    expect(d14.days.at(-1)).toEqual({ day: d14.today, tickets: 2 });
    expect(d14.days.reduce((n, d) => n + d.tickets, 0)).toBe(5);
    expect((await eventOverview(e.id, "Europe/Brussels", "7")).days.reduce((n, d) => n + d.tickets, 0)).toBe(2);
    const all = await eventOverview(e.id, "Europe/Brussels", "all");
    expect(all.days.length).toBeGreaterThanOrEqual(11);
    expect([parsePeriod("7"), parsePeriod("all"), parsePeriod(undefined), parsePeriod("n-importe")]).toEqual(["7", "all", "14", "14"]);
  });

  it("dernières commandes : payées et remboursées, la plus récente d'abord, lignes regroupées par tarif", async () => {
    const e = await eventWithOrders();
    const { recent } = await eventOverview(e.id, "Europe/Brussels", "14");
    expect(recent.map((r) => [r.buyer, r.status, r.lines])).toEqual([
      ["Léa Martin", "PAID", "2 × Normal"],
      ["Zoé Martin", "REFUNDED", "1 × Normal"],
      ["Tom Martin", "PAID", "3 × Normal"],
    ]);
  });
});
