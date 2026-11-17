import { beforeEach, describe, expect, it, vi } from "vitest";

// Boutique, lot 3d (section 9.35) : livraison simple à prix fixe, adresse de l'acheteur, expédition avec transporteur,
// numéro et lien de suivi (e-mail), livraison remboursable une fois, rétractation après la réception ; Stripe simulé
const fake = vi.hoisted(() => ({
  intents: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  refunds: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    paymentIntents: {
      create: async (p: Record<string, unknown>) => {
        const id = `pi_${Math.random().toString(36).slice(2, 12)}`;
        fake.intents.push({ id, ...p });
        return {
          id,
          client_secret: `cs_${id}`,
          status: "requires_payment_method",
        };
      },
      retrieve: async (id: string) => ({
        id,
        client_secret: `cs_${id}`,
        status: "requires_payment_method",
      }),
      update: async (id: string, p: Record<string, unknown>) => {
        fake.updates.push({ id, ...p });
        return { id };
      },
      cancel: async (id: string) => ({ id, status: "canceled" }),
    },
    charges: {
      retrieve: async (id: string) => ({
        id,
        payment_method_details: { type: "card", card: { fingerprint: null } },
        balance_transaction: null,
      }),
    },
    refunds: {
      create: async (p: Record<string, unknown>) => {
        fake.refunds.push(p);
        return {
          id: `re_${Math.random().toString(36).slice(2, 10)}`,
          status: "succeeded",
        };
      },
    },
  }),
}));

const { db } = await import("@/lib/db");
const { findOrgContext } = await import("@/server/context");
const shop = await import("@/server/shop");
const delivery = await import("@/server/shopDelivery");
const checkout = await import("@/server/shopCheckout");
const orders = await import("@/server/shopOrders");

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
beforeEach(() => {
  fake.intents = [];
  fake.updates = [];
  fake.refunds = [];
});

/** Organisation Pro (Stripe actif), un lieu de retrait, un mode de livraison à 4,90 €, un sweat livrable (21 %). */
async function setup() {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Nora",
      email: `envoi.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Salle ${id}`,
      slug: `salle-${id}`,
      subdomain: `salle-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
      subscription: {
        create: {
          planId: "pro",
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        },
      },
      stripeAccount: {
        create: {
          stripeAccountId: `acct_${id}`,
          country: "BE",
          defaultCurrency: "EUR",
          status: "ACTIVE",
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
        },
      },
    },
  });
  const role = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: { organizationId: org.id, userId: owner.id, roleId: role.id },
  });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: "Nora", email: owner.email },
  };
  const point = await delivery.createPickupPoint(ctx, {
    name: "Accueil",
    address: "Rue Haute 1",
  });
  const colis = await delivery.createShippingMethod(ctx, {
    name: "Colis suivi",
    price: "4,90",
  });
  const sweat = await shop.createProduct(ctx, {
    name: "Sweat",
    price: "25",
    vatRate: "21",
    pickupEnabled: true,
    shippingEnabled: true,
  });
  await shop.setProductStatus(ctx, sweat.id, "ON_SALE");
  const [v] = await db.productVariant.findMany({
    where: { productId: sweat.id },
  });
  return { ctx, org, point, colis, sweat, v: v! };
}

const address = {
  name: "Léa Martin",
  line1: "Rue Basse 2",
  line2: "",
  postalCode: "1000",
  city: "Bruxelles",
  country: "BE",
};
const buyer = (extra: Record<string, unknown>) => ({
  firstName: "Léa",
  lastName: "Martin",
  email: "lea@exemple.be",
  phone: null,
  marketingOptIn: false,
  pickupPointId: "",
  ...extra,
});
const orderOf = async (token: string) =>
  db.shopOrder.findUniqueOrThrow({
    where: { id: (await checkout.findShopOrderIdByToken(token))! },
    include: { lines: true },
  });
async function pay(token: string) {
  const o = await orderOf(token);
  return checkout.completeShopOrder(o.id, {
    paymentIntentId: o.stripePaymentIntentId!,
    amountMinor: o.totalMinor,
    currency: "eur",
    chargeId: null,
    paymentMethodType: "card",
  });
}

describe("boutique : livraison simple (US-SHOP-08, RG-SHOP-14, RG-SHOP-15)", () => {
  it("livraison : mode et adresse exigés, frais ajoutés au total et à la TVA, intention de paiement au bon montant ; retour au retrait", async () => {
    const { org, point, colis, v } = await setup();
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: v.id, quantity: 1 }],
      locale: "fr",
    });
    const page = await checkout.shopReservation(r.token);
    expect(page!.shippingMethods.map((m) => [m.name, m.priceMinor])).toEqual([
      ["Colis suivi", 490],
    ]);
    await expect(
      checkout.submitShopBuyer(
        r.token,
        buyer({
          mode: "SHIPPING",
          shippingMethodId: colis.id,
          address: { ...address, city: " " },
        }),
      ),
    ).rejects.toMatchObject({ code: "SHOP_ADDRESS_REQUIRED" });
    await expect(
      checkout.submitShopBuyer(
        r.token,
        buyer({ mode: "SHIPPING", shippingMethodId: "autre", address }),
      ),
    ).rejects.toMatchObject({ code: "SHOP_SHIPPING_REQUIRED" });
    await checkout.submitShopBuyer(
      r.token,
      buyer({ mode: "SHIPPING", shippingMethodId: colis.id, address }),
    );
    expect(await orderOf(r.token)).toMatchObject({
      fulfillmentMode: "SHIPPING",
      shippingName: "Colis suivi",
      shippingMinor: 490,
      shippingVatBps: 2100,
      subtotalMinor: 2500,
      totalMinor: 2990,
      vatMinor: 519,
      shipName: "Léa Martin",
      shipCity: "Bruxelles",
      shipCountry: "BE",
      pickupPointId: null,
    });
    expect(fake.intents[0]).toMatchObject({ amount: 2990 });
    // retour au retrait : la livraison est retirée du total, l'intention de paiement suit
    await checkout.submitShopBuyer(
      r.token,
      buyer({ mode: "PICKUP", pickupPointId: point.id }),
    );
    expect(await orderOf(r.token)).toMatchObject({
      fulfillmentMode: "PICKUP",
      shippingMinor: 0,
      totalMinor: 2500,
      vatMinor: 434,
      shipCity: null,
      pickupName: "Accueil",
    });
    expect(fake.updates.at(-1)).toMatchObject({ amount: 2500 });
  });

  it("un produit à retirer seulement : pas de livraison possible pour la commande", async () => {
    const { ctx, org, colis } = await setup();
    const poster = await shop.createProduct(ctx, {
      name: "Affiche",
      price: "15",
      vatRate: "6",
    });
    await shop.setProductStatus(ctx, poster.id, "ON_SALE");
    const [pv] = await db.productVariant.findMany({
      where: { productId: poster.id },
    });
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: pv!.id, quantity: 1 }],
      locale: "fr",
    });
    expect((await checkout.shopReservation(r.token))!.shippingMethods).toEqual(
      [],
    );
    await expect(
      checkout.submitShopBuyer(
        r.token,
        buyer({ mode: "SHIPPING", shippingMethodId: colis.id, address }),
      ),
    ).rejects.toMatchObject({ code: "SHOP_SHIPPING_REQUIRED" });
  });

  it("expédition : transporteur, numéro et lien de suivi, e-mail à l'acheteur ; une seule fois ; reçu avec la livraison", async () => {
    const { ctx, org, colis, v } = await setup();
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: v.id, quantity: 1 }],
      locale: "fr",
    });
    await checkout.submitShopBuyer(
      r.token,
      buyer({ mode: "SHIPPING", shippingMethodId: colis.id, address }),
    );
    await pay(r.token);
    const o = await orderOf(r.token);
    expect(
      await db.emailMessage.findFirstOrThrow({
        where: { organizationId: org.id, template: "shop.order_confirmed" },
      }),
    ).toMatchObject({
      subject: `Votre commande chez ${org.name}`,
    });
    await expect(
      orders.markShopOrderReady(ctx as never, o.id),
    ).rejects.toMatchObject({ code: "SHOP_ORDER_STATE" });
    await expect(
      orders.markShopOrderPickedUp(ctx as never, o.id),
    ).rejects.toMatchObject({ code: "SHOP_ORDER_STATE" });
    await expect(
      orders.markShopOrderShipped(ctx as never, o.id, {
        carrier: "bpost",
        trackingNumber: "CD123",
        trackingUrl: "http://suivi.example/CD123",
      }),
    ).rejects.toMatchObject({ code: "SHOP_TRACKING_INVALID" });
    await orders.markShopOrderShipped(ctx as never, o.id, {
      carrier: " bpost ",
      trackingNumber: " CD123456789BE ",
      trackingUrl: "https://track.example/CD123456789BE",
    });
    expect(await orderOf(r.token)).toMatchObject({
      fulfillmentStatus: "SHIPPED",
      carrier: "bpost",
      trackingNumber: "CD123456789BE",
      trackingUrl: "https://track.example/CD123456789BE",
    });
    const mail = await db.emailMessage.findFirstOrThrow({
      where: { organizationId: org.id, template: "shop.order_shipped" },
    });
    expect(mail.subject).toBe(`Votre commande est en route : ${org.name}`);
    await expect(
      orders.markShopOrderShipped(ctx as never, o.id, {
        carrier: "bpost",
        trackingNumber: "X",
        trackingUrl: "https://x.example",
      }),
    ).rejects.toMatchObject({ code: "SHOP_ORDER_STATE" });
    expect(
      (await orders.listShopOrders(ctx as never, "DONE")).map(
        (x) => x.fulfillmentStatus,
      ),
    ).toEqual(["SHIPPED"]);
    const receipt = orders.shopReceipt(await orderOf(r.token), "fr");
    expect(receipt.shipping).toMatch(/^4,90\s€$/);
    expect(receipt.vat).toEqual([
      { rate: "21", amount: expect.stringMatching(/^5,19\s€$/) },
    ]);
  });

  it("livraison remboursée une seule fois ; rétractation jusqu'à 14 jours après la réception estimée (expédition + 7 jours)", async () => {
    const { ctx, org, colis, v } = await setup();
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: v.id, quantity: 1 }],
      locale: "fr",
    });
    await checkout.submitShopBuyer(
      r.token,
      buyer({ mode: "SHIPPING", shippingMethodId: colis.id, address }),
    );
    await pay(r.token);
    const o = await orderOf(r.token);
    expect(
      await orders.refundShopOrder(ctx as never, o.id, {
        lines: [],
        restock: false,
        shipping: true,
      }),
    ).toEqual({ amountMinor: 490 });
    await expect(
      orders.refundShopOrder(ctx as never, o.id, {
        lines: [],
        restock: false,
        shipping: true,
      }),
    ).rejects.toMatchObject({ code: "SHOP_REFUND_INVALID" });
    expect(await orderOf(r.token)).toMatchObject({
      shippingRefunded: true,
      refundedMinor: 490,
      status: "PARTIALLY_REFUNDED",
    });
    // non expédiée : rétractation ouverte ; expédiée il y a 20 jours : encore ouverte ; il y a 22 jours : close
    expect((await orders.shopOrderForBuyer(r.token))!.canWithdraw).toBe(true);
    await db.shopOrder.update({
      where: { id: o.id },
      data: {
        fulfillmentStatus: "SHIPPED",
        shippedAt: new Date(Date.now() - 20 * DAY),
      },
    });
    expect((await orders.shopOrderForBuyer(r.token))!.canWithdraw).toBe(true);
    await db.shopOrder.update({
      where: { id: o.id },
      data: { shippedAt: new Date(Date.now() - 22 * DAY) },
    });
    expect((await orders.shopOrderForBuyer(r.token))!.canWithdraw).toBe(false);
  });
});
