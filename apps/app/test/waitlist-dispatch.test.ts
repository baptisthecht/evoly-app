import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { dispatchWaitlist, waitlistCounts } from "@/server/waitlist";

const rid = () => Math.random().toString(36).slice(2, 10);
const min = 60_000;
async function setup() {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 5 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: {
        create: [
          {
            name: "Complet",
            priceMinor: 0,
            currency: "EUR",
            quantity: 2,
            quantitySold: 2,
            sortOrder: 0,
          },
          {
            name: "Libre",
            priceMinor: 0,
            currency: "EUR",
            quantity: 50,
            sortOrder: 1,
          },
        ],
      },
    },
    include: { ticketTypes: { orderBy: { sortOrder: "asc" } } },
  });
  const [full, free] = [event.ticketTypes[0]!, event.ticketTypes[1]!];
  const paid = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId: free.id, quantity: 1 }],
    locale: "fr",
  });
  expect(
    await submitBuyer(paid.token, {
      firstName: "Léa",
      lastName: "Martin",
      email: `lea.${id}@exemple.be`,
      marketingOptIn: false,
    }),
  ).toEqual({
    kind: "PAID",
  });
  const pending = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId: free.id, quantity: 1 }],
    locale: "fr",
  });
  const entry = (
    status: "WAITING" | "OFFERED" | "CANCELLED",
    over: Record<string, unknown> = {},
  ) =>
    db.waitlistEntry.create({
      data: {
        eventId: event.id,
        ticketTypeId: full.id,
        email: `${rid()}@exemple.be`,
        quantity: 2,
        status,
        token: `jeton-${rid()}${rid()}`,
        ...over,
      },
    });
  const bought = await entry("OFFERED", {
    orderId: paid.orderId,
    offeredQuantity: 1,
    offeredAt: new Date(),
    offerExpiresAt: new Date(Date.now() + 30 * min),
  });
  const stillPaying = await entry("OFFERED", {
    orderId: pending.orderId,
    offeredQuantity: 1,
    offeredAt: new Date(),
    offerExpiresAt: new Date(Date.now() + 30 * min),
  });
  const lapsed = await entry("OFFERED", {
    offeredQuantity: 1,
    offeredAt: new Date(Date.now() - 60 * min),
    offerExpiresAt: new Date(Date.now() - min),
  });
  const waiting = await entry("WAITING");
  const cancelled = await entry("CANCELLED");
  return { event, full, bought, stillPaying, lapsed, waiting, cancelled };
}
const statusOf = async (id: string) =>
  (await db.waitlistEntry.findUniqueOrThrow({ where: { id } })).status;

describe("liste d'attente : tâche planifiée et comptage (RG-ATT-02, RG-ATT-03, RG-ATT-06)", () => {
  it("place achetée marquée achetée ; commande en attente : offre gardée ; offre échue : expirée ; tarif complet : l'inscrit attend", async () => {
    const s = await setup();
    await dispatchWaitlist();
    expect(await statusOf(s.bought.id)).toBe("PURCHASED");
    expect(await statusOf(s.stillPaying.id)).toBe("OFFERED");
    expect(await statusOf(s.lapsed.id)).toBe("EXPIRED");
    expect(await statusOf(s.waiting.id)).toBe("WAITING");
    expect(await statusOf(s.cancelled.id)).toBe("CANCELLED");
  });

  it("comptage pour l'organisateur : inscrits en attente et places proposées seulement, avec les places demandées", async () => {
    const s = await setup();
    const before = (await waitlistCounts(s.event.id)).find(
      (c) => c.ticketTypeId === s.full.id,
    )!;
    expect([before._count._all, before._sum.quantity]).toEqual([4, 8]); // 3 offres et 1 inscrit, 2 places chacun
    await dispatchWaitlist();
    const after = (await waitlistCounts(s.event.id)).find(
      (c) => c.ticketTypeId === s.full.id,
    )!;
    expect([after._count._all, after._sum.quantity]).toEqual([2, 4]); // l'offre achetée et l'offre échue ne comptent plus
  });
});
