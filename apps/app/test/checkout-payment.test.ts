import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder, submitBuyer } from "@/server/checkout";

// commandes payantes : montant minimum, paiement indisponible, création du paiement Stripe, confirmation
const fake = vi.hoisted(() => ({ available: true, created: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/stripe", () => ({
  stripe: () =>
    fake.available
      ? {
          paymentIntents: {
            // identifiant unique : la base de test garde les commandes d'un passage à l'autre
            create: async (p: Record<string, unknown>, o: Record<string, unknown>) => {
              const id = `pi_${Math.random().toString(36).slice(2, 12)}`;
              fake.created.push({ ...p, account: o?.stripeAccount, id });
              return { id, client_secret: `cs_${id}`, status: "requires_payment_method" };
            },
            retrieve: async (id: string) => ({ id, client_secret: `cs_${id}`, status: "requires_payment_method" }),
          },
        }
      : null,
}));
const rid = () => Math.random().toString(36).slice(2, 10);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const buyer = (email: string) => ({ firstName: "Léa", lastName: "Martin", email, marketingOptIn: false });
async function setup(o: { priceMinor: number; stripe?: boolean; tier?: boolean }) {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  if (o.stripe)
    await db.stripeAccount.create({
      data: {
        organizationId: org.id,
        stripeAccountId: `acct_${id}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
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
      ticketTypes: { create: [{ name: "Entrée", priceMinor: o.priceMinor, currency: "EUR", quantity: 100, sortOrder: 0 }] },
    },
    include: { ticketTypes: true },
  });
  const ticketTypeId = event.ticketTypes[0]!.id;
  const tier = o.tier ? await db.priceTier.create({ data: { ticketTypeId, name: "Prévente", priceMinor: o.priceMinor, quantityLimit: 10 } }) : null;
  return { org, event, ticketTypeId, tier, account: `acct_${id}` };
}
beforeEach(() => {
  fake.available = true;
  fake.created = [];
});

describe("commandes payantes", () => {
  it("montant minimum : une commande sous le minimum des paiements par carte est refusée", async () => {
    const { event, ticketTypeId } = await setup({ priceMinor: 20 });
    await expect(reserveOrder({ eventId: event.id, lines: [{ ticketTypeId, quantity: 1 }], locale: "fr" })).rejects.toMatchObject({
      code: "BELOW_MINIMUM_CHARGE",
    });
  });

  it("paiements indisponibles : sans compte Stripe actif, la commande payante est refusée", async () => {
    const { event, ticketTypeId } = await setup({ priceMinor: 1500 });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId, quantity: 1 }], locale: "fr" });
    await expect(submitBuyer(r.token, buyer("lea@exemple.be"))).rejects.toMatchObject({ code: "PAYMENTS_UNAVAILABLE" });
  });

  it("création du paiement : montant et commission demandés à Stripe, paiement rattaché à la commande ; confirmation : payée, billets comptés", async () => {
    const { event, ticketTypeId, tier, account } = await setup({ priceMinor: 1500, stripe: true, tier: true });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId, quantity: 2 }], locale: "fr" });
    const result = await submitBuyer(r.token, buyer("lea@exemple.be"));
    const order = await db.order.findFirstOrThrow({ where: { eventId: event.id } });
    const intent = fake.created[0]!.id as string;
    expect(order.stripePaymentIntentId).toBe(intent);
    expect(result).toMatchObject({ kind: "PAYMENT", clientSecret: `cs_${intent}`, stripeAccountId: account });
    expect(fake.created[0]).toMatchObject({ amount: order.totalMinor, application_fee_amount: order.applicationFeeMinor, account });
    // confirmation du paiement (webhook de Stripe)
    expect(await finalizeOrder(order.id, { paymentIntentId: intent, amountMinor: order.totalMinor, currency: "EUR" })).toBe("PAID");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(2);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).quantitySold).toBe(2);
    const t = await db.priceTier.findUniqueOrThrow({ where: { id: tier!.id } });
    expect([t.quantitySold, t.quantityHeld]).toEqual([2, 0]);
    // une seconde confirmation du même paiement ne compte rien deux fois
    expect(await finalizeOrder(order.id, { paymentIntentId: intent, amountMinor: order.totalMinor, currency: "EUR" })).toBe("ALREADY_PAID");
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(2);
  });
});
