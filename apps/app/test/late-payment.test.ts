import { beforeEach, describe, expect, it, vi } from "vitest";

// faux client Stripe : le remboursement est enregistré, aucune requête ne part
const fake = {
  refunds: {
    create: vi.fn(async () => ({
      id: `re_${Math.random().toString(36).slice(2, 8)}`,
    })),
  },
  paymentIntents: { cancel: vi.fn(async () => ({})) },
};
vi.mock("@/lib/stripe", () => ({ stripe: () => fake }));

const { db } = await import("@/lib/db");
const {
  finalizeOrder,
  refundUnfulfilledPayment,
  releaseExpiredHolds,
  reserveOrder,
} = await import("@/server/checkout");
const { handleConnectEvent } = await import("@/server/stripeConnectEvents");

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(quantity = 1) {
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
  const acct = `acct_${id}`;
  await db.stripeAccount.create({
    data: {
      organizationId: org.id,
      stripeAccountId: acct,
      country: "BE",
      defaultCurrency: "EUR",
      status: "ACTIVE",
      chargesEnabled: true,
      payoutsEnabled: true,
    },
  });
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
      ticketTypes: {
        create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity },
      },
    },
    include: { ticketTypes: true },
  });
  const reserver = async (at?: Date) => {
    const r = await reserveOrder(
      {
        eventId: event.id,
        lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }],
        locale: "fr",
      },
      at,
    );
    const email = `client.${rid()}@exemple.be`;
    await db.order.update({
      where: { id: r.orderId },
      data: {
        buyerEmail: email,
        buyerFirstName: "Alex",
        buyerLastName: "Martin",
        stripePaymentIntentId: `pi_${rid()}`,
      },
    });
    return { ...r, email };
  };
  return { org, acct, reserver };
}

describe("paiement arrivé après l'expiration de la réservation (section 10)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("remboursement intégral, commission comprise, sans risque de double remboursement ; acheteur prévenu", async () => {
    const s = await setup(5);
    const r = await s.reserver();
    await refundUnfulfilledPayment(r.orderId);
    expect(fake.refunds.create).toHaveBeenCalledTimes(1);
    const [params, opts] = fake.refunds.create.mock.calls[0]! as unknown as [
      Record<string, unknown>,
      Record<string, string>,
    ];
    expect(params).toMatchObject({
      refund_application_fee: true,
      metadata: { orderId: r.orderId, cause: "SOLD_OUT_AFTER_HOLD_EXPIRY" },
    });
    expect(opts).toEqual({
      stripeAccount: s.acct,
      idempotencyKey: `order:${r.orderId}:unfulfilled-refund`,
    });
    expect(
      await db.order.findUniqueOrThrow({ where: { id: r.orderId } }),
    ).toMatchObject({ status: "REFUNDED", refundedMinor: 1000 });
    expect(
      await db.emailMessage.count({
        where: { toEmail: r.email, template: "order.late_payment_refunded" },
      }),
    ).toBe(1);
  });

  it("parcours complet : réservation expirée, dernière place vendue entre-temps, paiement reçu ensuite : remboursé, aucun billet en trop", async () => {
    const s = await setup(1);
    const tardif = await s.reserver(new Date(Date.now() - 60 * 60_000)); // réservation expirée depuis longtemps
    await releaseExpiredHolds();
    // une réservation expirée annule aussi son paiement en attente chez Stripe
    const annule = fake.paymentIntents.cancel.mock.calls.map(
      (c) => (c as unknown[])[0],
    );
    expect(annule).toContain(
      (await db.order.findUniqueOrThrow({ where: { id: tardif.orderId } }))
        .stripePaymentIntentId,
    );
    const autre = await s.reserver();
    expect(await finalizeOrder(autre.orderId)).toBe("PAID"); // la dernière place part à quelqu'un d'autre
    const o = await db.order.findUniqueOrThrow({
      where: { id: tardif.orderId },
    });
    const pi = {
      id: o.stripePaymentIntentId,
      metadata: { orderId: o.id },
      amount_received: o.totalMinor,
      currency: "eur",
      latest_charge: `ch_${rid()}`,
      payment_method_types: ["bancontact"],
    };
    expect(
      await handleConnectEvent({
        id: `evt_${rid()}`,
        type: "payment_intent.succeeded",
        account: s.acct,
        data: { object: pi },
      } as never),
    ).toBe("PROCESSED");
    expect(await db.ticket.count({ where: { orderId: tardif.orderId } })).toBe(
      0,
    );
    expect(fake.refunds.create).toHaveBeenCalledTimes(1);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: tardif.orderId } }))
        .status,
    ).toBe("REFUNDED");
  });

  it("sans compte Stripe connecté : rien n'est tenté", async () => {
    const s = await setup(5);
    const r = await s.reserver();
    await db.stripeAccount.deleteMany({ where: { organizationId: s.org.id } });
    await refundUnfulfilledPayment(r.orderId);
    expect(fake.refunds.create).not.toHaveBeenCalled();
  });
});
