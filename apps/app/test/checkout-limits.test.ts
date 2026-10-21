import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelReservation, reserveOrder, submitBuyer } from "@/server/checkout";

// règles du panier qui protègent le stock : limite par acheteur, stock retenu puis libéré d'un palier de prix
const rid = () => Math.random().toString(36).slice(2, 10);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const buyer = (email: string) => ({ firstName: "Léa", lastName: "Martin", email, marketingOptIn: false });
async function setup(o: { maxTicketsPerBuyer?: number; priceMinor?: number; tier?: boolean } = {}) {
  const id = rid();
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
      startsAt: days(30),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      maxTicketsPerBuyer: o.maxTicketsPerBuyer ?? null,
      ticketTypes: { create: [{ name: "Entrée", priceMinor: o.priceMinor ?? 0, currency: "EUR", quantity: 100, sortOrder: 0 }] },
    },
    include: { ticketTypes: true },
  });
  const ticketTypeId = event.ticketTypes[0]!.id;
  const tier = o.tier ? await db.priceTier.create({ data: { ticketTypeId, name: "Prévente", priceMinor: o.priceMinor ?? 0, quantityLimit: 10 } }) : null;
  return { event, ticketTypeId, tier };
}

describe("panier : limite de billets par acheteur", () => {
  it("au-delà du maximum par adresse e-mail, la commande est refusée, même écrite en majuscules", async () => {
    const { event, ticketTypeId } = await setup({ maxTicketsPerBuyer: 2 });
    const first = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId, quantity: 2 }], locale: "fr" });
    await submitBuyer(first.token, buyer("lea@exemple.be"));
    const second = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId, quantity: 1 }], locale: "fr" });
    await expect(submitBuyer(second.token, buyer("LEA@exemple.be"))).rejects.toMatchObject({ code: "BUYER_LIMIT_REACHED" });
    // une autre adresse reste libre
    await expect(submitBuyer(second.token, buyer("tom@exemple.be"))).resolves.toBeTruthy();
  });
});

describe("panier : stock d'un palier de prix", () => {
  it("retenu à la réservation, libéré à l'annulation", async () => {
    const { event, ticketTypeId, tier } = await setup({ tier: true });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId, quantity: 3 }], locale: "fr" });
    expect((await db.priceTier.findUniqueOrThrow({ where: { id: tier!.id } })).quantityHeld).toBe(3);
    await cancelReservation(r.token);
    expect((await db.priceTier.findUniqueOrThrow({ where: { id: tier!.id } })).quantityHeld).toBe(0);
  });
});
