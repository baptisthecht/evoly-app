import { beforeEach, describe, expect, it, vi } from "vitest";

// Stripe simulé : chaque remboursement demandé est capturé, pour vérifier le montant exact rendu à l'acheteur
const appels: { amount: number; refund_application_fee: boolean }[] = [];
const fake = {
  refunds: {
    create: async (params: { amount: number; refund_application_fee: boolean }) => (
      appels.push(params),
      { id: `re_${Math.random().toString(36).slice(2)}`, status: "succeeded" }
    ),
  },
};
vi.mock("@/lib/stripe", () => ({ stripe: () => fake }));

const { db } = await import("@/lib/db");
const { finalizeOrder, reserveOrder } = await import("@/server/checkout");
const { findOrgContext } = await import("@/server/context");
const { createOption, redeemOption, setOptionsRefundAfterStart } = await import("@/server/options");
const { approveRefund, cancelEvent, refundOptions, refundTickets } = await import("@/server/refunds");

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE" } });
  await db.stripeAccount.create({ data: { organizationId: org.id, stripeAccountId: `acct_${id}`, country: "BE", defaultCurrency: "EUR" } });
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
  const jeton = await createOption(ctx, event.id, { name: "Jeton boisson", price: "3" });
  const vestiaire = await createOption(ctx, event.id, { name: "Vestiaire", price: "2" });
  return { ctx, event, type: event.ticketTypes[0]!, jeton, vestiaire };
}
type S = Awaited<ReturnType<typeof setup>>;
/** Achat réel payé par carte : 2 billets à 10 €, 3 jetons à 3 €, 1 vestiaire à 2 € (total 31 €). */
async function acheter(s: S, billets = 2) {
  const r = await reserveOrder({
    eventId: s.event.id,
    lines: [{ ticketTypeId: s.type.id, quantity: billets }],
    options: [
      { optionId: s.jeton.id, quantity: 3 },
      { optionId: s.vestiaire.id, quantity: 1 },
    ],
    locale: "fr",
  });
  await db.order.update({
    where: { id: r.orderId },
    data: { buyerEmail: `a.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin", stripePaymentIntentId: `pi_${rid()}` },
  });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { tickets: true, options: true } });
  const ligne = (optionId: string) => order.options.find((o) => o.optionId === optionId)!;
  return { order, jeton: ligne(s.jeton.id), vestiaire: ligne(s.vestiaire.id) };
}
const etat = (id: string) => db.orderOption.findUniqueOrThrow({ where: { id }, select: { quantity: true, redeemed: true, refunded: true } });

describe("remboursement des options (RG-OPT-07)", () => {
  beforeEach(() => {
    appels.length = 0;
  });

  it("tous les billets remboursés : les options non retirées le sont avec eux, jamais celles servies au bar ; montant exact rendu ; commission non rendue", async () => {
    const s = await setup();
    const a = await acheter(s);
    expect(a.order.totalMinor).toBe(3100);
    expect(await redeemOption(s.event.id, a.jeton.id, 1, { staffName: "Bar" })).toEqual({ left: 2 });
    expect(
      await refundTickets(
        s.ctx,
        a.order.id,
        a.order.tickets.map((t) => t.id),
        "OTHER",
        null,
      ),
    ).toBe("SUCCEEDED");
    expect(appels).toEqual([expect.objectContaining({ amount: 2000 + 2 * 300 + 200, refund_application_fee: false })]); // le jeton servi n'est pas rendu
    expect(await etat(a.jeton.id)).toEqual({ quantity: 3, redeemed: 1, refunded: 2 });
    expect(await etat(a.vestiaire.id)).toEqual({ quantity: 1, redeemed: 0, refunded: 1 });
    expect(await db.order.findUniqueOrThrow({ where: { id: a.order.id } })).toMatchObject({ refundedMinor: 2800, status: "REFUNDED" });
    const refund = await db.refund.findFirstOrThrow({ where: { orderId: a.order.id }, include: { optionItems: true } });
    expect([refund.amountMinor, refund.optionItems.length]).toEqual([2800, 2]);
    await expect(redeemOption(s.event.id, a.jeton.id, 1, { staffName: "Bar" })).rejects.toMatchObject({ code: "OPTION_NOT_REDEEMABLE" }); // remboursée : plus retirable
  });

  it("une partie des billets remboursée : les options restent intactes", async () => {
    const s = await setup();
    const a = await acheter(s);
    await refundTickets(s.ctx, a.order.id, [a.order.tickets[0]!.id], "OTHER", null);
    expect(appels.map((c) => c.amount)).toEqual([1000]);
    expect([(await etat(a.jeton.id)).refunded, (await etat(a.vestiaire.id)).refunded]).toEqual([0, 0]);
    expect((await db.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe("PARTIALLY_REFUNDED");
  });

  it("options seules : avant le début, à la quantité près ; après le début, refusé sauf réglage de l'organisateur", async () => {
    const s = await setup();
    const a = await acheter(s);
    await redeemOption(s.event.id, a.jeton.id, 1, { staffName: "Bar" });
    expect(await refundOptions(s.ctx, a.order.id, [{ orderOptionId: a.jeton.id, quantity: 2 }], null)).toBe("SUCCEEDED");
    expect(appels.map((c) => c.amount)).toEqual([600]);
    expect(await etat(a.jeton.id)).toEqual({ quantity: 3, redeemed: 1, refunded: 2 });
    expect(await db.order.findUniqueOrThrow({ where: { id: a.order.id } })).toMatchObject({ refundedMinor: 600, status: "PARTIALLY_REFUNDED" });
    // plus aucun jeton à rembourser ; quantités impossibles et options inconnues refusées
    for (const lines of [
      [{ orderOptionId: a.jeton.id, quantity: 1 }],
      [{ orderOptionId: a.vestiaire.id, quantity: 2 }],
      [{ orderOptionId: "inconnue", quantity: 1 }],
      [{ orderOptionId: a.vestiaire.id, quantity: -1 }],
      [],
    ])
      await expect(refundOptions(s.ctx, a.order.id, lines, null)).rejects.toMatchObject({ code: "OPTION_NOT_REFUNDABLE" });
    // l'événement a commencé : refusé, puis permis par le réglage
    await db.event.update({ where: { id: s.event.id }, data: { startsAt: new Date(Date.now() - DAY) } });
    await expect(refundOptions(s.ctx, a.order.id, [{ orderOptionId: a.vestiaire.id, quantity: 1 }], null)).rejects.toMatchObject({
      code: "OPTIONS_REFUND_CLOSED",
    });
    await setOptionsRefundAfterStart(s.ctx, s.event.id, true);
    expect(await refundOptions(s.ctx, a.order.id, [{ orderOptionId: a.vestiaire.id, quantity: 1 }], null)).toBe("SUCCEEDED");
    expect(appels.map((c) => c.amount)).toEqual([600, 200]);
    expect((await db.order.findUniqueOrThrow({ where: { id: a.order.id } })).refundedMinor).toBe(800);
  });

  it("annulation de l'événement : remboursement intégral, options comprises", async () => {
    const s = await setup();
    const a = await acheter(s);
    const b = await acheter(s, 1);
    await cancelEvent(s.ctx, s.event.id, "Salle indisponible", s.event.title);
    expect(appels.map((c) => c.amount).sort((x, y) => x - y)).toEqual([2100, 3100]); // 1 billet + 11 € d'options ; 2 billets + 11 € d'options
    for (const o of [a, b]) {
      expect((await etat(o.jeton.id)).refunded).toBe(3);
      expect((await etat(o.vestiaire.id)).refunded).toBe(1);
      expect((await db.order.findUniqueOrThrow({ where: { id: o.order.id } })).status).toBe("REFUNDED");
    }
  });

  it("demande de l'acheteur pour tous ses billets, approuvée : les options non retirées sont comptées au moment du remboursement", async () => {
    const s = await setup();
    const a = await acheter(s);
    const demande = await db.refund.create({
      data: {
        orderId: a.order.id,
        status: "REQUESTED",
        initiator: "BUYER",
        reason: "BUYER_REQUEST",
        amountMinor: 2000,
        items: { create: a.order.tickets.map((t) => ({ ticketId: t.id, amountMinor: t.faceValueMinor })) },
      },
    });
    await redeemOption(s.event.id, a.vestiaire.id, 1, { staffName: "Vestiaire" }); // servi entre la demande et l'approbation
    await approveRefund(s.ctx, demande.id, null);
    expect(appels.map((c) => c.amount)).toEqual([2000 + 3 * 300]); // le vestiaire servi n'est pas rendu
    expect(await etat(a.vestiaire.id)).toEqual({ quantity: 1, redeemed: 1, refunded: 0 });
  });
});
