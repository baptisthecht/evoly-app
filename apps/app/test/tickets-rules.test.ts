import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createEvent, publishEvent } from "@/server/events";
import { createTicketType, deleteTicketType, saveTiers, updateTicketType } from "@/server/tickets";

// règles des tarifs (US-TKT-01 à 05, RG-EVT-02) et des paliers de prix (Pro)
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
const base = {
  name: "Fosse",
  price: "0",
  quantity: 100,
  minPerOrder: 1,
  maxPerOrder: 10,
  visibility: "VISIBLE" as const,
  isNominative: false,
  resaleAllowed: true,
};
async function setup(o: { pro?: boolean } = {}) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (o.pro)
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) },
    });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "Entrée", price: "0", quantity: 100 });
  const first = await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } });
  return { ctx, event, first };
}
const refused = (code: string) => expect.objectContaining({ code });
const hold = (eventId: string, ticketTypeId: string, quantity = 1) => reserveOrder({ eventId, lines: [{ ticketTypeId, quantity }], locale: "fr" });

describe("tarifs : règles refusées", () => {
  it("limites par commande incohérentes, quantité nulle, fin des ventes avant leur ouverture", async () => {
    const { ctx, event } = await setup();
    for (const bad of [{ minPerOrder: 0 }, { minPerOrder: 5, maxPerOrder: 2 }, { maxPerOrder: 51 }])
      await expect(createTicketType(ctx, event.id, { ...base, ...bad })).rejects.toEqual(refused("INVALID_ORDER_LIMITS"));
    await expect(createTicketType(ctx, event.id, { ...base, quantity: 0 })).rejects.toEqual(refused("INVALID_QUANTITY"));
    await expect(createTicketType(ctx, event.id, { ...base, salesStartLocal: "2027-03-10T10:00", salesEndLocal: "2027-03-01T10:00" })).rejects.toEqual(
      refused("SALES_END_BEFORE_START"),
    );
  });

  it("événement terminé : verrouillé ; publié sans Stripe : un tarif payant est refusé, un tarif gratuit accepté", async () => {
    const { ctx, event } = await setup();
    await publishEvent(ctx, event.id);
    await expect(createTicketType(ctx, event.id, { ...base, price: "12" })).rejects.toEqual(refused("PUBLISH_STRIPE_REQUIRED"));
    await expect(createTicketType(ctx, event.id, base)).resolves.toBeTruthy();
    await db.event.update({ where: { id: event.id }, data: { status: "ENDED" } });
    await expect(createTicketType(ctx, event.id, base)).rejects.toEqual(refused("EVENT_LOCKED"));
  });

  it("après une vente : prix verrouillé, quantité jamais sous les ventes, suppression refusée ; tarif inconnu : introuvable", async () => {
    const { ctx, event, first } = await setup();
    await publishEvent(ctx, event.id);
    // une vente réelle : une simple réservation peut encore expirer et ne verrouille pas le prix
    const sale = await hold(event.id, first.id, 3);
    await submitBuyer(sale.token, {
      firstName: "Léa",
      lastName: "Martin",
      email: `lea.${Math.random().toString(36).slice(2, 8)}@exemple.be`,
      marketingOptIn: false,
    });
    const input = { ...base, name: first.name };
    await expect(updateTicketType(ctx, event.id, first.id, { ...input, price: "5" })).rejects.toEqual(refused("PRICE_LOCKED"));
    await expect(updateTicketType(ctx, event.id, first.id, { ...input, quantity: 2 })).rejects.toEqual(refused("QUANTITY_BELOW_SOLD"));
    await expect(updateTicketType(ctx, event.id, first.id, { ...input, quantity: 3 })).resolves.toBeTruthy();
    await expect(deleteTicketType(ctx, event.id, first.id)).rejects.toEqual(refused("TICKET_TYPE_HAS_SALES"));
    await expect(updateTicketType(ctx, event.id, "tarif-inconnu", input)).rejects.toEqual(refused("NOT_FOUND"));
  });
});

describe("paliers de prix (Pro)", () => {
  const tier = (o: Record<string, unknown> = {}) => ({ name: "Prévente", price: "0", quantityLimit: 10, ...o });

  it("offre gratuite : refusé ; plus de 10 paliers ; palier sans date ni limite ; fin avant le début ; palier inconnu", async () => {
    const free = await setup();
    await expect(saveTiers(free.ctx, free.event.id, free.first.id, [tier()])).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx, event, first } = await setup({ pro: true });
    await expect(
      saveTiers(
        ctx,
        event.id,
        first.id,
        Array.from({ length: 11 }, (_, i) => tier({ name: `Palier ${i}` })),
      ),
    ).rejects.toEqual(refused("TOO_MANY_TIERS"));
    await expect(saveTiers(ctx, event.id, first.id, [tier({ quantityLimit: null })])).rejects.toEqual(refused("TIER_NEEDS_LIMIT"));
    await expect(saveTiers(ctx, event.id, first.id, [tier({ startsAtLocal: "2027-03-10T10:00", endsAtLocal: "2027-03-01T10:00" })])).rejects.toEqual(
      refused("TIER_END_BEFORE_START"),
    );
    await expect(saveTiers(ctx, event.id, first.id, [tier({ id: "palier-inconnu" })])).rejects.toEqual(refused("NOT_FOUND"));
  });

  it("palier qui a des ventes : ni supprimé, ni changé de prix, ni limité sous ses ventes", async () => {
    const { ctx, event, first } = await setup({ pro: true });
    await saveTiers(ctx, event.id, first.id, [tier()]);
    const saved = await db.priceTier.findFirstOrThrow({ where: { ticketTypeId: first.id } });
    await publishEvent(ctx, event.id);
    await hold(event.id, first.id, 4); // 4 places retenues sur le palier
    expect((await db.priceTier.findUniqueOrThrow({ where: { id: saved.id } })).quantityHeld).toBe(4);
    await expect(saveTiers(ctx, event.id, first.id, [])).rejects.toEqual(refused("TIER_HAS_SALES"));
    await expect(saveTiers(ctx, event.id, first.id, [tier({ id: saved.id, quantityLimit: 3 })])).rejects.toEqual(refused("QUANTITY_BELOW_SOLD"));
    await expect(saveTiers(ctx, event.id, first.id, [tier({ id: saved.id, quantityLimit: 4 })])).resolves.toBeTruthy();
  });
});
