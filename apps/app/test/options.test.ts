import { describe, expect, it } from "vitest";
import { optionCommission } from "@evoly/core";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createOption, listOptions, optionsForScan, optionsForTicket, publicOptions, redeemOption, setOptionActive } from "@/server/options";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(plan: "pro" | "free") {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (plan === "pro") await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE" } });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 100 } },
    },
    include: { ticketTypes: true },
  });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { event, type: event.ticketTypes[0]!, ctx };
}
const payer = async (orderId: string) => {
  await db.order.update({ where: { id: orderId }, data: { buyerEmail: `a.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  return finalizeOrder(orderId);
};

describe("options et consommations prépayées (section 9.29)", () => {
  it("commission des options : le pourcentage des billets, sans part fixe, avec le plafond (RG-OPT-06)", () => {
    const terms = { planId: "pro", currency: "EUR", fixedMinor: 29, rateBps: 200, capMinor: 100 };
    expect(optionCommission(200, terms)).toBe(4);
    expect(optionCommission(0, terms)).toBe(0);
    expect(optionCommission(10_000, terms)).toBe(100);
  });

  it("réservé à l'offre Pro (RG-OPT-09) : création refusée en Free, rien à la vente, réservation refusée", async () => {
    const s = await setup("free");
    await expect(createOption(s.ctx, s.event.id, { name: "Jeton", price: "2" })).rejects.toMatchObject({ code: "FEATURE_UNAVAILABLE" });
    const opt = await db.eventOption.create({ data: { eventId: s.event.id, name: "Jeton", priceMinor: 200 } });
    expect(await publicOptions(s.event.id, s.ctx.features)).toEqual([]);
    await expect(
      reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.type.id, quantity: 1 }], locale: "fr", options: [{ optionId: opt.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "FEATURE_UNAVAILABLE" });
  });

  it("achat avec options : total et commission, stock et maximum respectés, réservation expirée qui libère, retrait atomique au bar", async () => {
    const s = await setup("pro");
    const jeton = await createOption(s.ctx, s.event.id, { name: "Jeton boisson", price: "2", stock: "5", maxPerOrder: "4" });
    const panier = (quantity: number) => ({
      eventId: s.event.id,
      lines: [{ ticketTypeId: s.type.id, quantity: 1 }],
      locale: "fr",
      options: [{ optionId: jeton.id, quantity }],
    });
    const r = await reserveOrder(panier(3));
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(order.totalMinor).toBe(1000 + 3 * 200);
    expect(order.applicationFeeMinor).toBe(49 + 3 * 4); // billet : 0,29 € + 2 % de 10 € ; jetons : 2 % de 2 €
    expect(r.options).toEqual([{ optionId: jeton.id, name: "Jeton boisson", quantity: 3, unitPriceMinor: 200 }]);
    await expect(reserveOrder(panier(3))).rejects.toMatchObject({ code: "OPTION_SOLD_OUT" });
    await expect(reserveOrder(panier(5))).rejects.toMatchObject({ code: "OPTION_MAX_EXCEEDED" });
    await reserveOrder(panier(2), new Date(Date.now() - 60 * 60_000)); // réservation d'il y a une heure, expirée
    expect((await publicOptions(s.event.id, s.ctx.features))[0]!.left).toBe(2); // elle ne retient plus rien
    expect(await payer(r.orderId)).toBe("PAID");
    const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: r.orderId } });
    const [ligne] = await optionsForTicket(s.event.id, ticket.id);
    expect(ligne).toMatchObject({ name: "Jeton boisson", quantity: 3, left: 3 });
    expect(await redeemOption(s.event.id, ligne!.id, 2, { staffName: "Bar 1" })).toEqual({ left: 1 });
    const deuxTelephones = await Promise.allSettled([redeemOption(s.event.id, ligne!.id, 1), redeemOption(s.event.id, ligne!.id, 1)]);
    expect(deuxTelephones.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await optionsForTicket(s.event.id, ticket.id))[0]!.left).toBe(0);
    expect(await db.optionRedemption.count({ where: { orderOptionId: ligne!.id } })).toBe(2);
    expect((await listOptions(s.ctx, s.event.id))[0]).toMatchObject({ sold: 3, redeemed: 3 });
    await setOptionActive(s.ctx, s.event.id, jeton.id, false);
    expect(await publicOptions(s.event.id, s.ctx.features)).toEqual([]);
  });

  it("au bar : un billet scanné par son QR code ou son code court montre ses options ; un billet d'un autre événement est refusé", async () => {
    const s = await setup("pro");
    const autre = await setup("pro");
    const jeton = await createOption(s.ctx, s.event.id, { name: "Jeton boisson", price: "2" });
    const r = await reserveOrder({
      eventId: s.event.id,
      lines: [{ ticketTypeId: s.type.id, quantity: 1 }],
      locale: "fr",
      options: [{ optionId: jeton.id, quantity: 2 }],
    });
    expect(await payer(r.orderId)).toBe("PAID");
    const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: r.orderId } });
    const parCode = await optionsForScan(s.event.id, { code: ticket.code });
    expect(parCode.options).toEqual([expect.objectContaining({ name: "Jeton boisson", quantity: 2, left: 2 })]);
    expect((await optionsForScan(s.event.id, { shortCode: ticket.shortCode })).options[0]!.left).toBe(2);
    await expect(optionsForScan(autre.event.id, { code: ticket.code })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
