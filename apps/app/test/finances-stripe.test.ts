import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { stripeOverview, upsertDispute } from "@/server/finances";

// finances (RG-FIN-03) : vue d'ensemble Stripe (solde, virements, panne) et contestations de paiement
const fake = vi.hoisted(() => ({ down: false }));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    balance: {
      retrieve: async () => {
        if (fake.down) throw new Error("Stripe indisponible");
        return {
          available: [{ amount: 12_500, currency: "eur" }],
          pending: [{ amount: 3_000, currency: "eur" }],
        };
      },
    },
    payouts: {
      list: async () => ({
        data: [
          {
            id: "po_1",
            amount: 9_000,
            currency: "eur",
            status: "paid",
            arrival_date: 1_790_000_000,
          },
        ],
      }),
    },
  }),
}));
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(withAccount = true) {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  const account = `acct_${id}`;
  if (withAccount)
    await db.stripeAccount.create({
      data: {
        organizationId: org.id,
        stripeAccountId: account,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
    });
  return {
    org,
    account,
    ctx: { organization: org, features: [] } as unknown as OrgContext,
  };
}
/** Une commande réglée, avec son identifiant de paiement Stripe (charge). */
async function paidOrder(organizationId: string, charge: string) {
  const id = rid();
  const event = await db.event.create({
    data: {
      organizationId,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: {
        create: [
          {
            name: "Entrée",
            priceMinor: 0,
            currency: "EUR",
            quantity: 50,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }],
    locale: "fr",
  });
  await submitBuyer(r.token, {
    firstName: "Léa",
    lastName: "Martin",
    email: `lea${id}@exemple.be`,
    marketingOptIn: false,
  });
  const order = await db.order.findFirstOrThrow({
    where: { eventId: event.id },
  });
  return db.order.update({
    where: { id: order.id },
    data: { stripeChargeId: charge },
  });
}
beforeEach(() => {
  fake.down = false;
});

describe("finances : vue d'ensemble Stripe", () => {
  it("sans compte Stripe : non connectée", async () => {
    const { ctx } = await setup(false);
    expect(await stripeOverview(ctx)).toEqual({ connected: false });
  });

  it("Stripe répond : solde et virements repris (devises en majuscules, date d'arrivée)", async () => {
    const { ctx } = await setup();
    const o = await stripeOverview(ctx);
    expect(o).toMatchObject({
      connected: true,
      unavailable: false,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
    if (!o.connected) throw new Error("connectée attendue");
    expect(o.balance).toEqual({
      available: [{ amount: 12_500, currency: "EUR" }],
      pending: [{ amount: 3_000, currency: "EUR" }],
    });
    expect(o.payouts).toEqual([
      {
        id: "po_1",
        amount: 9_000,
        currency: "EUR",
        status: "paid",
        arrivalDate: new Date(1_790_000_000 * 1000),
      },
    ]);
  });

  it("Stripe en panne : la vue le signale sans planter", async () => {
    fake.down = true;
    const { ctx } = await setup();
    expect(await stripeOverview(ctx)).toMatchObject({
      connected: true,
      unavailable: true,
      balance: null,
      payouts: null,
    });
  });
});

describe("finances : contestations de paiement", () => {
  it("rattachée à sa commande, signalée une seule fois ; les mises à jour changent le statut", async () => {
    const { org, account, ctx } = await setup();
    // un membre : les alertes sont créées pour chaque membre de l'organisation
    const owner = await db.user.create({
      data: {
        name: "Camille",
        email: `camille.${rid()}@exemple.be`,
        emailVerified: true,
      },
    });
    const ownerRole = await db.role.findFirstOrThrow({
      where: { systemKey: "OWNER" },
    });
    await db.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: owner.id,
        roleId: ownerRole.id,
        status: "ACTIVE",
      },
    });
    const charge = `ch_${rid()}`;
    const order = await paidOrder(org.id, charge);
    const dispute = {
      id: `dp_${rid()}`,
      charge,
      account,
      amount: 2_500,
      currency: "eur",
      reason: "fraudulent",
      status: "needs_response",
      dueBy: 1_790_500_000,
    };
    const before = await db.notification.count({
      where: { organizationId: org.id },
    });
    await upsertDispute(dispute);
    const saved = await db.dispute.findUniqueOrThrow({
      where: { stripeDisputeId: dispute.id },
    });
    expect(saved).toMatchObject({
      orderId: order.id,
      amountMinor: 2_500,
      currency: "EUR",
      status: "NEEDS_RESPONSE",
      evidenceDueBy: new Date(1_790_500_000 * 1000),
    });
    expect(
      await db.notification.count({ where: { organizationId: org.id } }),
    ).toBe(before + 1);
    // ouverte : listée dans la vue d'ensemble, avec sa commande
    const o = await stripeOverview(ctx);
    if (!o.connected) throw new Error("connectée attendue");
    expect(o.disputes.map((d) => d.order?.id)).toEqual([order.id]);
    // gagnée : statut mis à jour, aucune nouvelle alerte, plus listée parmi les litiges ouverts
    await upsertDispute({ ...dispute, status: "won" });
    expect(
      (
        await db.dispute.findUniqueOrThrow({
          where: { stripeDisputeId: dispute.id },
        })
      ).status,
    ).toBe("WON");
    expect(
      await db.notification.count({ where: { organizationId: org.id } }),
    ).toBe(before + 1);
    const after = await stripeOverview(ctx);
    if (!after.connected) throw new Error("connectée attendue");
    expect(after.disputes).toEqual([]);
    // statut inconnu de Stripe : traité comme une réponse attendue
    await upsertDispute({ ...dispute, status: "statut_inconnu" });
    expect(
      (
        await db.dispute.findUniqueOrThrow({
          where: { stripeDisputeId: dispute.id },
        })
      ).status,
    ).toBe("NEEDS_RESPONSE");
  });
});
