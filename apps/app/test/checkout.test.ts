import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { CartRejected, finalizeOrder, orderAccessToken, releaseExpiredHolds, reserveOrder, submitBuyer } from "@/server/checkout";

const rid = () => Math.random().toString(36).slice(2, 10);
const future = () => new Date(Date.now() + 30 * 86_400_000);
const buyer = (email: string) => ({ firstName: "Léa", lastName: "Martin", email, marketingOptIn: false });

async function setup(opts: { quantities: Array<number | null>; capacity?: number | null; priceMinor?: number }) {
  const id = rid();
  const org = await db.organization.create({ data: { name: `Test ${id}`, slug: `test-${id}`, subdomain: `test-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `evenement-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Événement ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: future(),
      status: "PUBLISHED",
      capacity: opts.capacity ?? null,
      ticketTypes: { create: opts.quantities.map((q, i) => ({ name: `Tarif ${i + 1}`, priceMinor: opts.priceMinor ?? 0, currency: "EUR", quantity: q, sortOrder: i })) },
    },
    include: { ticketTypes: { orderBy: { sortOrder: "asc" } } },
  });
  return { org, event, types: event.ticketTypes };
}

const stock = (id: string) => db.ticketType.findUniqueOrThrow({ where: { id }, select: { quantitySold: true, quantityHeld: true } });

describe("réservation atomique (RG-BUY-01)", () => {
  it("40 réservations simultanées pour 10 places : exactement 10 réussissent", async () => {
    const { event, types } = await setup({ quantities: [10] });
    const results = await Promise.allSettled(Array.from({ length: 40 }, () => reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof CartRejected)).toBe(true);
    expect(await stock(types[0]!.id)).toEqual({ quantitySold: 0, quantityHeld: 10 });
  });

  it("jauge commune à plusieurs tarifs illimités", async () => {
    const { event, types } = await setup({ quantities: [null, null], capacity: 5 });
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[i % 2]!.id, quantity: 1 }], locale: "fr" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  });

  it("prix et commission calculés côté serveur", async () => {
    const { event, types } = await setup({ quantities: [100], priceMinor: 2400 });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 2 }], locale: "fr" });
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(order.totalMinor).toBe(4800);
    expect(order.applicationFeeMinor).toBe(154); // 2 × (0,29 € + 2 % de 24 €) en Free
    expect(r.token).toBe(orderAccessToken(r.orderId, 1));
  });
});

describe("validation de commande (RG-BUY-07)", () => {
  it("commande gratuite : réservé → vendu, billets créés, une seule fois", async () => {
    const { org, event, types } = await setup({ quantities: [50] });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 3 }], locale: "fr" });
    const email = `lea.${rid()}@exemple.be`;
    expect(await submitBuyer(r.token, buyer(email))).toEqual({ kind: "PAID" });
    expect(await finalizeOrder(r.orderId)).toBe("ALREADY_PAID");
    expect(await stock(types[0]!.id)).toEqual({ quantitySold: 3, quantityHeld: 0 });
    const tickets = await db.ticket.findMany({ where: { orderId: r.orderId } });
    expect(tickets).toHaveLength(3);
    expect(new Set(tickets.map((t) => t.code)).size).toBe(3);
    expect(tickets.every((t) => t.code.length >= 32 && t.shortCode.length === 8)).toBe(true);
    const contact = await db.contact.findUniqueOrThrow({ where: { organizationId_email: { organizationId: org.id, email } } });
    expect(contact).toMatchObject({ ordersCount: 1, ticketsCount: 3, marketingConsent: false });
  });

  it("réservation expirée : places libérées, paiement tardif honoré s'il reste de la place", async () => {
    const { event, types } = await setup({ quantities: [10] });
    const past = new Date(Date.now() - 20 * 60_000);
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 2 }], locale: "fr" }, past);
    expect(await releaseExpiredHolds()).toBeGreaterThanOrEqual(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe("EXPIRED");
    expect(await stock(types[0]!.id)).toEqual({ quantitySold: 0, quantityHeld: 0 });
    await expect(submitBuyer(r.token, buyer(`tard.${rid()}@exemple.be`))).rejects.toThrow("HOLD_EXPIRED");
    await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `tard.${rid()}@exemple.be`, buyerFirstName: "Tom", buyerLastName: "Tard" } });
    expect(await finalizeOrder(r.orderId)).toBe("PAID");
    expect(await stock(types[0]!.id)).toEqual({ quantitySold: 2, quantityHeld: 0 });
  });

  it("paiement tardif sans place : remboursement requis, aucune survente", async () => {
    const { event, types } = await setup({ quantities: [2] });
    const past = new Date(Date.now() - 20 * 60_000);
    const late = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 2 }], locale: "fr" }, past);
    await releaseExpiredHolds();
    const other = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 2 }], locale: "fr" });
    await submitBuyer(other.token, buyer(`autre.${rid()}@exemple.be`));
    await db.order.update({ where: { id: late.orderId }, data: { buyerEmail: `tard.${rid()}@exemple.be`, buyerFirstName: "Tom", buyerLastName: "Tard" } });
    expect(await finalizeOrder(late.orderId)).toBe("REFUND_REQUIRED");
    expect((await db.order.findUniqueOrThrow({ where: { id: late.orderId } })).status).toBe("FAILED");
    expect(await stock(types[0]!.id)).toEqual({ quantitySold: 2, quantityHeld: 0 });
  });
});

import { PDFDocument } from "pdf-lib";
import { ticketCommission } from "@evoly/core";
import { PromoRejected, updateTicketHolder } from "@/server/checkout";
import { ticketsPdfFor } from "@/server/orders";
import { getPlans } from "@/server/plans";

async function setupWith(tt: Array<{ priceMinor: number; quantity?: number | null; visibility?: "VISIBLE" | "CODE_ONLY"; isNominative?: boolean }>) {
  const id = rid();
  const org = await db.organization.create({ data: { name: `Test ${id}`, slug: `test-${id}`, subdomain: `test-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const event = await db.event.create({
    data: {
      organizationId: org.id, slug: `evenement-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Événement ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: future(), status: "PUBLISHED",
      ticketTypes: { create: tt.map((t, i) => ({ name: `Tarif ${i + 1}`, priceMinor: t.priceMinor, currency: "EUR", quantity: t.quantity ?? 100, visibility: t.visibility ?? "VISIBLE", isNominative: t.isNominative ?? false, sortOrder: i })) },
    },
    include: { ticketTypes: { orderBy: { sortOrder: "asc" } } },
  });
  return { org, event, types: event.ticketTypes };
}
const promo = (eventId: string, data: Partial<{ code: string; discountType: "PERCENT" | "AMOUNT" | "FREE"; percentOffBps: number; amountOffMinor: number; maxUses: number; maxUsesPerEmail: number; unlocksHidden: boolean; ticketTypeIds: string[] }>) =>
  db.promoCode.create({ data: { eventId, code: data.code ?? `CODE${rid().toUpperCase()}`, discountType: data.discountType ?? "PERCENT", percentOffBps: data.percentOffBps ?? null, amountOffMinor: data.amountOffMinor ?? null, maxUses: data.maxUses ?? null, maxUsesPerEmail: data.maxUsesPerEmail ?? null, unlocksHidden: data.unlocksHidden ?? false, ticketTypeIds: data.ticketTypeIds ?? [] } });

describe("codes promo (RG-PRM-01 à 05)", () => {
  it("pourcentage : remise sur le prix, commission calculée sur le prix remisé", async () => {
    const { event, types } = await setupWith([{ priceMinor: 2400 }]);
    const p = await promo(event.id, { code: "DIX", discountType: "PERCENT", percentOffBps: 1000 });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 2 }], locale: "fr", promoCode: " dix " });
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    const terms = (await getPlans()).free.terms.EUR!;
    expect(order).toMatchObject({ subtotalMinor: 4800, discountMinor: 480, totalMinor: 4320, promoCodeId: p.id });
    expect(order.applicationFeeMinor).toBe(2 * ticketCommission(2160, terms));
    expect(r.lines[0]!.unitPriceMinor).toBe(2160);
  });

  it("gratuité : commande gratuite sans commission, compteur incrémenté au paiement, puis épuisé", async () => {
    const { event, types } = await setupWith([{ priceMinor: 4500 }]);
    const p = await promo(event.id, { code: "INVITE", discountType: "FREE", maxUses: 1 });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", promoCode: "INVITE" });
    expect(r).toMatchObject({ isFree: true, totalMinor: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).applicationFeeMinor).toBe(0);
    expect(await submitBuyer(r.token, buyer(`invite.${rid()}@exemple.be`))).toEqual({ kind: "PAID" });
    expect((await db.promoCode.findUniqueOrThrow({ where: { id: p.id } })).usedCount).toBe(1);
    await expect(reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", promoCode: "INVITE" })).rejects.toMatchObject({ reason: "EXHAUSTED" });
  });

  it("limite d'utilisations : les réservations en cours comptent", async () => {
    const { event, types } = await setupWith([{ priceMinor: 2000 }]);
    await promo(event.id, { code: "UNSEUL", discountType: "AMOUNT", amountOffMinor: 500, maxUses: 1 });
    await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", promoCode: "UNSEUL" });
    await expect(reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", promoCode: "UNSEUL" })).rejects.toBeInstanceOf(PromoRejected);
  });

  it("tarif réservé aux codes : invisible sans code, débloqué par un code qui l'autorise", async () => {
    const { event, types } = await setupWith([{ priceMinor: 1500, visibility: "CODE_ONLY" }]);
    await promo(event.id, { code: "PRESSE", discountType: "FREE", unlocksHidden: true });
    await expect(reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr" })).rejects.toBeInstanceOf(CartRejected);
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", promoCode: "PRESSE" });
    expect(r.isFree).toBe(true);
  });

  it("limite par adresse e-mail, vérifiée dès que l'e-mail est connu", async () => {
    const { event, types } = await setupWith([{ priceMinor: 1000 }]);
    await promo(event.id, { code: "PERSO", discountType: "FREE", maxUsesPerEmail: 1 });
    const email = `perso.${rid()}@exemple.be`;
    const first = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", promoCode: "PERSO" });
    await submitBuyer(first.token, buyer(email));
    const second = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", promoCode: "PERSO" });
    await expect(submitBuyer(second.token, buyer(email.toUpperCase()))).rejects.toMatchObject({ reason: "EMAIL_LIMIT" });
  });
});

describe("billets nominatifs et PDF (RG-QST-01, RG-QST-02, section 9.12)", () => {
  it("titulaires obligatoires, reportés sur les billets, modifiables, puis PDF d'une page par billet", async () => {
    const { event, types } = await setupWith([{ priceMinor: 0, isNominative: true }]);
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 2 }], locale: "fr" });
    await expect(submitBuyer(r.token, buyer(`nom.${rid()}@exemple.be`))).rejects.toThrow("HOLDERS_REQUIRED");
    const itemId = r.lines[0]!.orderItemId;
    await submitBuyer(r.token, { ...buyer(`nom.${rid()}@exemple.be`), holders: { [itemId]: [{ firstName: "Léa", lastName: "Martin" }, { firstName: "Tom", lastName: "Dubois" }] } });
    const tickets = await db.ticket.findMany({ where: { orderId: r.orderId }, orderBy: { createdAt: "asc" } });
    expect(tickets.map((t) => `${t.holderFirstName} ${t.holderLastName}`).sort()).toEqual(["Léa Martin", "Tom Dubois"]);
    await updateTicketHolder(r.token, tickets[0]!.id, { firstName: "Zoé", lastName: "Leroy" });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: tickets[0]!.id } })).holderFirstName).toBe("Zoé");

    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { organization: { select: { name: true } }, event: true, tickets: { include: { ticketType: { select: { name: true } } } } } });
    const bytes = await ticketsPdfFor(order, "fr");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});
