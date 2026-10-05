import { describe, expect, it, vi } from "vitest";

let charge: Record<string, unknown> = {};
const fake = { charges: { retrieve: vi.fn(async () => charge) } };
vi.mock("@/lib/stripe", () => ({ stripe: () => fake }));

const { db } = await import("@/lib/db");
const { reserveOrder, submitBuyer } = await import("@/server/checkout");
const { fillMissingStripeFees, stripeFeesForCharge } = await import("@/server/orders");

describe("frais Stripe et moyen de paiement relevés après le paiement (RG-BUY-07)", () => {
  it("transaction pas encore créée : reprise plus tard ; puis frais et net enregistrés une fois ; moyen de paiement réel", async () => {
    const id = Math.random().toString(36).slice(2, 10);
    const org = await db.organization.create({
      data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
    });
    await db.stripeAccount.create({ data: { organizationId: org.id, stripeAccountId: `acct_${id}`, country: "BE", defaultCurrency: "EUR", status: "ACTIVE" } });
    const event = await db.event.create({
      data: {
        organizationId: org.id,
        slug: `gala-${id}`,
        publicCode: `G${id}`.toUpperCase().slice(0, 8),
        title: `Gala ${id}`,
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 5 * 86_400_000),
        status: "PUBLISHED",
        ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 10 } },
      },
      include: { ticketTypes: true },
    });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false });
    const chargeId = `ch_${id}`;
    await db.order.update({
      where: { id: r.orderId },
      data: { stripeChargeId: chargeId, paymentFeeMinor: null, netMinor: null, paymentMethodType: "card", paidAt: new Date() },
    });

    // charge.updated arrivé avant la transaction : rien d'enregistré, mais le moyen de paiement réel l'est
    charge = { id: chargeId, payment_method_details: { type: "bancontact" }, balance_transaction: null };
    expect(await stripeFeesForCharge(chargeId)).toBe(false);
    expect(await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).toMatchObject({ paymentMethodType: "bancontact", paymentFeeMinor: null });

    // transaction créée : le rattrapage planifié (commandes récentes d'abord) enregistre frais et net
    charge = {
      id: chargeId,
      payment_method_details: { type: "bancontact" },
      balance_transaction: {
        currency: "eur",
        net: 9645,
        fee_details: [
          { type: "stripe_fee", amount: 175 },
          { type: "application_fee", amount: 180 },
        ],
      },
    };
    expect(await fillMissingStripeFees()).toBeGreaterThanOrEqual(1);
    expect(await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).toMatchObject({ paymentFeeMinor: 175, netMinor: 9645 });
    expect(await stripeFeesForCharge(chargeId)).toBe(false); // déjà relevé : rien à refaire
    expect(fake.charges.retrieve).toHaveBeenCalledWith(chargeId, { expand: ["balance_transaction"] }, { stripeAccount: `acct_${id}` });
  });
});
