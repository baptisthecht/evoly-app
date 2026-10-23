import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  available: true,
  pi: null as null | Record<string, unknown>,
  retrieved: [] as Array<{ id: string; account?: string }>,
}));
vi.mock("@/lib/stripe", () => {
  const any = (): unknown => new Proxy({}, { get: () => async () => ({}) }); // toute autre demande à Stripe : réponse vide
  return {
    stripe: () =>
      fake.available
        ? new Proxy(
            {},
            {
              get: (_t, res) =>
                res === "paymentIntents"
                  ? {
                      retrieve: async (
                        id: string,
                        _p: unknown,
                        o?: { stripeAccount?: string },
                      ) => (
                        fake.retrieved.push({ id, account: o?.stripeAccount }),
                        fake.pi
                      ),
                    }
                  : any(),
            },
          )
        : null,
  };
});
const { db } = await import("@/lib/db");
const { reserveOrder } = await import("@/server/checkout");
const { syncPaymentFromStripe } = await import("@/server/orders");

const rid = () => Math.random().toString(36).slice(2, 10);
async function pendingOrder(
  opts: { account?: boolean; intent?: boolean } = {},
) {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  if (opts.account !== false)
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
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 5 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Fosse",
          priceMinor: 2_500,
          currency: "EUR",
          quantity: 50,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }],
    locale: "fr",
  });
  const order = await db.order.update({
    where: { id: r.orderId },
    data: {
      buyerFirstName: "Léa",
      buyerLastName: "Martin",
      buyerEmail: `lea.${id}@exemple.be`,
      ...(opts.intent === false ? {} : { stripePaymentIntentId: `pi_${id}` }),
    },
  });
  return { id, order, account: `acct_${id}` };
}
const succeeded = (o: { id: string; order: { totalMinor: number } }) => ({
  id: `pi_${o.id}`,
  status: "succeeded",
  amount_received: o.order.totalMinor,
  currency: "eur",
  latest_charge: `ch_${o.id}`,
  payment_method_types: ["card"],
});
const statusOf = async (orderId: string) =>
  (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status;
beforeEach(() => {
  fake.available = true;
  fake.pi = null;
  fake.retrieved = [];
});

describe("retour de Stripe : commande validée sans attendre le webhook (RG-BUY-08)", () => {
  it("paiement confirmé chez Stripe : commande payée et billets créés, paiement relu sur le compte de l'organisateur", async () => {
    const o = await pendingOrder();
    fake.pi = succeeded(o);
    await syncPaymentFromStripe(o.order.id);
    expect(fake.retrieved).toEqual([{ id: `pi_${o.id}`, account: o.account }]);
    expect(await statusOf(o.order.id)).toBe("PAID");
    expect(await db.ticket.count({ where: { orderId: o.order.id } })).toBe(1);
  });

  it("paiement encore en cours : la commande reste en attente", async () => {
    const o = await pendingOrder();
    fake.pi = { ...succeeded(o), status: "processing" };
    await syncPaymentFromStripe(o.order.id);
    expect(await statusOf(o.order.id)).toBe("PENDING");
  });

  it("commande déjà payée : jamais revalidée, Stripe n'est même pas interrogé", async () => {
    const o = await pendingOrder();
    fake.pi = succeeded(o);
    await syncPaymentFromStripe(o.order.id);
    fake.retrieved = [];
    await syncPaymentFromStripe(o.order.id);
    expect(fake.retrieved).toEqual([]);
    expect(await db.ticket.count({ where: { orderId: o.order.id } })).toBe(1);
  });

  it("sans paiement Stripe ou sans compte de l'organisateur : rien", async () => {
    const noIntent = await pendingOrder({ intent: false });
    await syncPaymentFromStripe(noIntent.order.id);
    const noAccount = await pendingOrder({ account: false });
    await syncPaymentFromStripe(noAccount.order.id);
    expect(fake.retrieved).toEqual([]);
    expect([
      await statusOf(noIntent.order.id),
      await statusOf(noAccount.order.id),
    ]).toEqual(["PENDING", "PENDING"]);
  });

  it("Stripe indisponible ou commande inconnue : rien", async () => {
    const o = await pendingOrder();
    fake.available = false;
    await syncPaymentFromStripe(o.order.id);
    await syncPaymentFromStripe(`commande-inconnue-${rid()}`);
    expect(await statusOf(o.order.id)).toBe("PENDING");
  });
});
