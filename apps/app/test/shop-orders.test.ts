import { beforeEach, describe, expect, it, vi } from "vitest";

// Boutique, lot 3b (section 9.35) : panier, réservation atomique, paiement sans commission Evoly, validation unique,
// réservations expirées, retrait au code QR, remboursements, rétractation de 14 jours ; Stripe simulé
const fake = vi.hoisted(() => ({
  intents: [] as Array<Record<string, unknown>>,
  intentStatus: "requires_payment_method",
  confirmStatus: "succeeded",
  cancelled: [] as string[],
  fingerprint: null as string | null,
  chargeFingerprint: null as string | null,
  balance: null as null | { currency: string; net: number; fee: number },
  refunds: [] as Array<Record<string, unknown>>,
  refundFails: false,
  confirmError: null as null | Record<string, unknown>,
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
        status: fake.intentStatus,
        amount_received:
          (fake.intents.find((i) => i.id === id)?.amount as number) ?? 0,
        currency: "eur",
        latest_charge: `ch_${id}`,
        payment_method_types: ["card"],
      }),
      update: async (id: string) => ({ id }),
      confirm: async (id: string) => {
        if (fake.confirmError) throw fake.confirmError;
        return { id, client_secret: `cs_${id}`, status: fake.confirmStatus };
      },
      cancel: async (id: string) => {
        fake.cancelled.push(id);
        return { id, status: "canceled" };
      },
    },
    confirmationTokens: {
      retrieve: async (id: string) => ({
        id,
        payment_method_preview: fake.fingerprint
          ? { type: "card", card: { fingerprint: fake.fingerprint } }
          : { type: "bancontact" },
      }),
    },
    charges: {
      retrieve: async (id: string) => ({
        id,
        payment_method_details: fake.chargeFingerprint
          ? { type: "card", card: { fingerprint: fake.chargeFingerprint } }
          : { type: "bancontact" },
        balance_transaction: fake.balance
          ? {
              currency: fake.balance.currency,
              net: fake.balance.net,
              fee_details: [{ type: "stripe_fee", amount: fake.balance.fee }],
            }
          : null,
      }),
    },
    refunds: {
      create: async (p: Record<string, unknown>) => {
        if (fake.refundFails) throw new Error("Stripe indisponible");
        fake.refunds.push(p);
        return {
          id: `re_${fake.refunds.length}_${Math.random().toString(36).slice(2, 8)}`,
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
const publicShop = await import("@/server/shopPublic");
const { blockBuyer } = await import("@/server/blockedBuyers");
const { handleConnectEvent } = await import("@/server/stripeConnectEvents");

const rid = () => Math.random().toString(36).slice(2, 10);
beforeEach(() => {
  fake.intents = [];
  fake.intentStatus = "requires_payment_method";
  fake.confirmStatus = "succeeded";
  fake.cancelled = [];
  fake.fingerprint = null;
  fake.chargeFingerprint = null;
  fake.balance = null;
  fake.refunds = [];
  fake.refundFails = false;
  fake.confirmError = null;
});

/** Organisation Pro avec Stripe actif, un lieu de retrait, un t-shirt (S : 3 en stock, M : illimité) en vente. */
async function setup(plan: "pro" | "free" = "pro") {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Nora",
      email: `boutique.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Théâtre ${id}`,
      slug: `theatre-${id}`,
      subdomain: `theatre-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
      subscription: {
        create: {
          planId: "pro",
          currency: "EUR",
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
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
    address: "Rue Haute 1, 1000 Bruxelles",
    instructions: "Du mardi au samedi",
  });
  const product = await shop.createProduct(ctx, {
    name: "T-shirt",
    price: "25",
    vatRate: "21",
    description: "Coton bio",
  });
  await shop.saveProductOptions(ctx, product.id, [
    { name: "Taille", values: [{ name: "S" }, { name: "M" }] },
  ]);
  const variants = await db.productVariant.findMany({
    where: { productId: product.id },
    orderBy: { sortOrder: "asc" },
  });
  const [s, m] = variants;
  await shop.saveVariants(ctx, product.id, [
    { id: s!.id, stock: "3", priceDelta: "", active: true },
    { id: m!.id, stock: "", priceDelta: "2", active: true },
  ]);
  await shop.setProductStatus(ctx, product.id, "ON_SALE");
  if (plan === "free")
    await db.subscription.update({
      where: { organizationId: org.id },
      data: { planId: "free" },
    });
  return { ctx, org, point, product, s: s!, m: m! };
}

const buyer = (point: string, email = "lea@exemple.be") => ({
  firstName: "Léa",
  lastName: "Martin",
  email,
  phone: null,
  marketingOptIn: false,
  pickupPointId: point,
});
const variant = (id: string) =>
  db.productVariant.findUniqueOrThrow({ where: { id } });
const orderOf = async (token: string) =>
  db.shopOrder.findUniqueOrThrow({
    where: { id: (await checkout.findShopOrderIdByToken(token))! },
    include: { lines: true },
  });
/** Paiement réussi, comme le webhook payment_intent.succeeded. */
async function pay(token: string) {
  const o = await orderOf(token);
  return checkout.completeShopOrder(o.id, {
    paymentIntentId: o.stripePaymentIntentId!,
    amountMinor: o.totalMinor,
    currency: "eur",
    chargeId: `ch_${o.id}`,
    paymentMethodType: "card",
  });
}

describe("boutique publique : catalogue et panier (US-SHOP-04)", () => {
  it("produits en vente seulement, épuisé signalé ; rien en offre gratuite ; panier relu par le serveur", async () => {
    const { ctx, org, product, s, m } = await setup();
    const draft = await shop.createProduct(ctx, {
      name: "Affiche",
      price: "15",
      vatRate: "21",
    });
    const cards = await publicShop.publicShopProducts(org.id);
    expect(
      cards?.map((c) => [c.name, c.priceMinMinor, c.priceMaxMinor, c.soldOut]),
    ).toEqual([["T-shirt", 2500, 2700, false]]);
    expect(await publicShop.publicShopProduct(org.id, draft.slug)).toBeNull();
    const page = await publicShop.publicShopProduct(org.id, product.slug);
    expect(page).toMatchObject({
      name: "T-shirt",
      pickupPoints: ["Accueil"],
      options: [{ name: "Taille", values: [{ name: "S" }, { name: "M" }] }],
    });
    expect(
      page!.variants.map((v) => [v.label, v.priceMinor, v.available]),
    ).toEqual([
      ["S", 2500, 3],
      ["M", 2700, null],
    ]);
    expect(
      publicShop.productGridItems(cards!, "fr", (p) => `dès ${p}`)[0]!.price,
    ).toMatch(/^dès 25\s€$/);
    // panier : quantités bornées, lignes d'une même variante réunies, variantes inconnues écartées
    expect(
      checkout.cleanCart([
        { variantId: s.id, quantity: 2 },
        { variantId: s.id, quantity: 1.7 },
        { variantId: "x", quantity: 1 },
        { variantId: m.id, quantity: 99 },
        { variantId: m.id, quantity: 0 },
      ]),
    ).toEqual([
      { variantId: s.id, quantity: 3 },
      { variantId: m.id, quantity: 20 },
    ]);
    const preview = await checkout.cartPreview(org.id, [
      { variantId: s.id, quantity: 5 },
      { variantId: m.id, quantity: 1 },
    ]);
    expect(
      preview.map((l) => [l.variantLabel, l.unitPriceMinor, l.problem]),
    ).toEqual([
      ["S", 2500, "NOT_ENOUGH"],
      ["M", 2700, null],
    ]);
    expect(
      await checkout.cartPreview((await setup()).org.id, [
        { variantId: s.id, quantity: 1 },
      ]),
    ).toEqual([]); // autre organisation
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 0 } });
    expect((await publicShop.publicShopProducts(org.id))![0]!.soldOut).toBe(
      false,
    ); // M reste disponible
    await db.productVariant.update({ where: { id: m.id }, data: { stock: 0 } });
    expect((await publicShop.publicShopProducts(org.id))![0]!.soldOut).toBe(
      true,
    );
    const free = await setup("free");
    expect(await publicShop.publicShopProducts(free.org.id)).toBeNull();
    expect(
      await publicShop.publicShopProduct(free.org.id, free.product.slug),
    ).toBeNull();
    await expect(
      checkout.reserveShopOrder({
        organizationId: free.org.id,
        lines: [{ variantId: free.s.id, quantity: 1 }],
        locale: "fr",
      }),
    ).rejects.toMatchObject({ code: "SHOP_UNAVAILABLE" });
  });
});

describe("boutique publique : réservation et paiement (RG-SHOP-07, RG-SHOP-08)", () => {
  it("réservation atomique : stock retenu, jamais dépassé ; prix, options et TVA figés ; libérée à l'expiration", async () => {
    const { org, s, m } = await setup();
    const now = new Date();
    const r = await checkout.reserveShopOrder(
      {
        organizationId: org.id,
        lines: [
          { variantId: s.id, quantity: 2 },
          { variantId: m.id, quantity: 1 },
        ],
        locale: "fr-BE",
      },
      now,
    );
    expect(r.reference).toMatch(/^EVS-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect((await variant(s.id)).held).toBe(2);
    const o = await orderOf(r.token);
    expect(o).toMatchObject({
      status: "PENDING",
      subtotalMinor: 7700,
      totalMinor: 7700,
      vatMinor: 1336,
      currency: "EUR",
      locale: "fr-BE",
    });
    expect(o.pickupCode).toMatch(/^[2-9A-Z]{10}$/);
    expect(
      o.lines.map((l) => [
        l.productName,
        l.variantLabel,
        l.quantity,
        l.unitPriceMinor,
        l.vatRateBps,
      ]),
    ).toEqual([
      ["T-shirt", "S", 2, 2500, 2100],
      ["T-shirt", "M", 1, 2700, 2100],
    ]);
    // il reste 1 S : une deuxième réservation de 2 est refusée en entier (M non retenu non plus)
    await expect(
      checkout.reserveShopOrder({
        organizationId: org.id,
        lines: [
          { variantId: m.id, quantity: 1 },
          { variantId: s.id, quantity: 2 },
        ],
        locale: "fr",
      }),
    ).rejects.toMatchObject({ code: "SHOP_OUT_OF_STOCK" });
    expect((await variant(m.id)).held).toBe(1);
    await expect(
      checkout.reserveShopOrder({
        organizationId: org.id,
        lines: [],
        locale: "fr",
      }),
    ).rejects.toMatchObject({ code: "SHOP_CART_EMPTY" });
    // la réservation de la commande vit 15 minutes, puis la tâche planifiée la libère et annule le paiement
    await checkout.submitShopBuyer(
      r.token,
      buyer(
        (
          await db.pickupPoint.findFirstOrThrow({
            where: { organizationId: org.id },
          })
        ).id,
      ),
      now,
    );
    // la tâche libère toutes les réservations expirées de la base : seule celle-ci est suivie
    await checkout.releaseExpiredShopHolds(
      new Date(now.getTime() + 10 * 60_000),
    );
    expect((await orderOf(r.token)).status).toBe("PENDING");
    expect(
      await checkout.releaseExpiredShopHolds(
        new Date(now.getTime() + 16 * 60_000),
      ),
    ).toBeGreaterThanOrEqual(1);
    expect((await orderOf(r.token)).status).toBe("EXPIRED");
    expect([(await variant(s.id)).held, (await variant(m.id)).held]).toEqual([
      0, 0,
    ]);
    expect(fake.cancelled).toContain(
      (await orderOf(r.token)).stripePaymentIntentId,
    );
    await expect(
      checkout.submitShopBuyer(r.token, buyer("x")),
    ).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
  });

  it("modes de remise : un produit livré seulement ne se commande pas avec un produit retiré seulement", async () => {
    const { ctx, org, s } = await setup();
    await delivery.createShippingMethod(ctx, { name: "Colis", price: "4,90" });
    const poster = await shop.createProduct(ctx, {
      name: "Affiche",
      price: "15",
      vatRate: "6",
      pickupEnabled: false,
      shippingEnabled: true,
    });
    await shop.setProductStatus(ctx, poster.id, "ON_SALE");
    const [pv] = await db.productVariant.findMany({
      where: { productId: poster.id },
    });
    await expect(
      checkout.reserveShopOrder({
        organizationId: org.id,
        lines: [
          { variantId: s.id, quantity: 1 },
          { variantId: pv!.id, quantity: 1 },
        ],
        locale: "fr",
      }),
    ).rejects.toMatchObject({ code: "SHOP_MODES_CONFLICT" });
  });

  it("coordonnées et lieu de retrait, paiement sur le compte de l'organisation sans commission ; validation unique ; e-mail et notification", async () => {
    const { org, point, s, m } = await setup();
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [
        { variantId: s.id, quantity: 2 },
        { variantId: m.id, quantity: 1 },
      ],
      locale: "fr",
    });
    await expect(
      checkout.submitShopBuyer(r.token, buyer("autre")),
    ).rejects.toMatchObject({ code: "SHOP_PICKUP_REQUIRED" });
    await expect(
      checkout.submitShopBuyer(r.token, {
        ...buyer(point.id),
        email: "pas-une-adresse",
      }),
    ).rejects.toMatchObject({ code: "EMAIL_INVALID" });
    await expect(
      checkout.submitShopBuyer(r.token, { ...buyer(point.id), lastName: " " }),
    ).rejects.toMatchObject({ code: "BUYER_NAME_REQUIRED" });
    const first = await checkout.submitShopBuyer(r.token, buyer(point.id));
    expect(first).toMatchObject({
      stripeAccountId: `acct_${org.subdomain!.slice(8)}`,
    });
    expect(fake.intents).toHaveLength(1);
    expect(fake.intents[0]).toMatchObject({
      amount: 7700,
      currency: "eur",
      receipt_email: "lea@exemple.be",
    });
    expect(fake.intents[0]).not.toHaveProperty("application_fee_amount"); // RG-SHOP-08 : aucune commission Evoly
    expect(
      (fake.intents[0]!.metadata as Record<string, string>).shopOrderId,
    ).toBeTruthy();
    // second envoi : la même intention de paiement est reprise
    await checkout.submitShopBuyer(r.token, buyer(point.id));
    expect(fake.intents).toHaveLength(1);
    const o = await orderOf(r.token);
    expect(o).toMatchObject({
      pickupName: "Accueil",
      pickupInstructions: "Du mardi au samedi",
      buyerEmailKey: "lea@exemple.be",
      termsVersion: "2026-11",
    });
    // paiement confirmé par le serveur, validation bancaire demandée ou non
    fake.confirmStatus = "requires_action";
    expect(
      await checkout.confirmShopPayment(
        r.token,
        "ctoken_12345678",
        "https://x/boutique/commande/t",
      ),
    ).toMatchObject({ kind: "ACTION" });
    fake.confirmStatus = "succeeded";
    expect(
      await checkout.confirmShopPayment(
        r.token,
        "ctoken_12345678",
        "https://x",
      ),
    ).toEqual({ kind: "DONE" });
    await expect(
      checkout.confirmShopPayment(r.token, "pas-un-jeton", "https://x"),
    ).rejects.toMatchObject({ code: "PAYMENT_INVALID" });
    fake.balance = { currency: "eur", net: 7489, fee: 211 };
    expect(await pay(r.token)).toBe("PAID");
    expect(await pay(r.token)).toBe("ALREADY_PAID");
    const paid = await orderOf(r.token);
    expect(paid).toMatchObject({
      status: "PAID",
      paymentFeeMinor: 211,
      netMinor: 7489,
      holdExpiresAt: null,
    });
    expect(
      [await variant(s.id), await variant(m.id)].map((v) => [
        v.stock,
        v.held,
        v.sold,
      ]),
    ).toEqual([
      [1, 0, 2],
      [null, 0, 1],
    ]);
    const mail = await db.emailMessage.findFirstOrThrow({
      where: { organizationId: org.id, template: "shop.order_confirmed" },
    });
    expect(mail.subject).toBe(`Votre commande chez ${org.name}`);
    expect(
      await db.notification.count({
        where: { organizationId: org.id, type: "SHOP_ORDER_PAID" },
      }),
    ).toBeGreaterThan(0);
    // un montant ou une intention qui ne correspondent pas : ignoré
    expect(
      await checkout.completeShopOrder(paid.id, {
        paymentIntentId: "pi_autre",
        amountMinor: 1,
        currency: "eur",
        chargeId: null,
        paymentMethodType: null,
      }),
    ).toBe("IGNORED");
    expect(
      await checkout.completeShopOrder("inconnue", {
        paymentIntentId: "x",
        amountMinor: 1,
        currency: "eur",
        chargeId: null,
        paymentMethodType: null,
      }),
    ).toBe("IGNORED");
  });

  it("personne bloquée : adresse refusée à la saisie, carte refusée avant le débit, carte passée outre remboursée (RG-BLK-01, RG-BLK-02)", async () => {
    const { ctx, org, point, s } = await setup();
    const blocked = await blockBuyer(ctx as never, {
      email: "nuisible@exemple.be",
    });
    const r1 = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await expect(
      checkout.submitShopBuyer(
        r1.token,
        buyer(point.id, "Nuisible@exemple.be"),
      ),
    ).rejects.toMatchObject({ code: "BUYER_BLOCKED" });
    expect((await orderOf(r1.token)).status).toBe("CANCELLED");
    expect((await variant(s.id)).held).toBe(0);
    // carte bloquée : refusée avant le débit
    await db.blockedCard.create({
      data: {
        blockedBuyerId: blocked.id,
        organizationId: org.id,
        fingerprint: "fp_bloquee",
      },
    });
    const r2 = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await checkout.submitShopBuyer(r2.token, buyer(point.id));
    fake.fingerprint = "fp_bloquee";
    await expect(
      checkout.confirmShopPayment(r2.token, "ctoken_12345678", "https://x"),
    ).rejects.toMatchObject({ code: "BUYER_BLOCKED" });
    expect((await orderOf(r2.token)).status).toBe("CANCELLED");
    // filet de sécurité : paiement reçu avec une carte bloquée, remboursé, commande non validée
    fake.fingerprint = null;
    const r3 = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await checkout.submitShopBuyer(r3.token, buyer(point.id));
    fake.chargeFingerprint = "fp_bloquee";
    expect(await pay(r3.token)).toBe("IGNORED");
    expect((await orderOf(r3.token)).status).toBe("CANCELLED");
    expect(fake.refunds).toHaveLength(1);
  });

  it("paiement arrivé après l'expiration : servi si le stock le permet, sinon remboursé en entier", async () => {
    const { org, point, s } = await setup();
    const now = new Date();
    const late = await checkout.reserveShopOrder(
      {
        organizationId: org.id,
        lines: [{ variantId: s.id, quantity: 2 }],
        locale: "fr",
      },
      now,
    );
    await checkout.submitShopBuyer(late.token, buyer(point.id), now);
    await checkout.releaseExpiredShopHolds(
      new Date(now.getTime() + 20 * 60_000),
    );
    expect(await pay(late.token)).toBe("PAID"); // 3 en stock, rien de retenu ailleurs
    expect((await variant(s.id)).stock).toBe(1);
    const other = await checkout.reserveShopOrder(
      {
        organizationId: org.id,
        lines: [{ variantId: s.id, quantity: 1 }],
        locale: "fr",
      },
      now,
    );
    await checkout.submitShopBuyer(other.token, buyer(point.id), now);
    await checkout.releaseExpiredShopHolds(
      new Date(now.getTime() + 20 * 60_000),
    );
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 0 } });
    expect(await pay(other.token)).toBe("REFUND_REQUIRED");
    expect(await orderOf(other.token)).toMatchObject({
      status: "CANCELLED",
      refundedMinor: 2500,
    });
    expect(fake.refunds.at(-1)).toMatchObject({
      payment_intent: (await orderOf(other.token)).stripePaymentIntentId,
    });
  });

  it("webhooks : paiement validé, intention annulée, frais relevés, remboursement suivi ; retour de la banque", async () => {
    const { org, point, s } = await setup();
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await checkout.submitShopBuyer(r.token, buyer(point.id));
    const o = await orderOf(r.token);
    expect(
      await handleConnectEvent({
        type: "payment_intent.canceled",
        data: {
          object: {
            id: o.stripePaymentIntentId,
            metadata: { shopOrderId: o.id },
          },
        },
      } as never),
    ).toBe("PROCESSED");
    expect(
      (await orderOf(r.token)).holdExpiresAt!.getTime(),
    ).toBeLessThanOrEqual(Date.now());
    await db.shopOrder.update({
      where: { id: o.id },
      data: { holdExpiresAt: new Date(Date.now() + 60_000) },
    });
    expect(
      await handleConnectEvent({
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: o.stripePaymentIntentId,
            amount_received: 2500,
            currency: "eur",
            latest_charge: `ch_web_${o.id}`,
            payment_method_types: ["card"],
            metadata: { shopOrderId: o.id },
          },
        },
      } as never),
    ).toBe("PROCESSED");
    expect((await orderOf(r.token)).status).toBe("PAID");
    fake.balance = { currency: "eur", net: 2400, fee: 100 };
    expect(
      await handleConnectEvent({
        type: "charge.updated",
        data: {
          object: { id: `ch_web_${o.id}`, balance_transaction: "txn_1" },
        },
      } as never),
    ).toBe("PROCESSED");
    expect((await orderOf(r.token)).paymentFeeMinor).toBe(100);
    expect(await checkout.shopFeesForCharge(`ch_web_${o.id}`)).toBe(false); // déjà relevés
    // retour de la banque : validée sans attendre le webhook
    const r2 = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await checkout.submitShopBuyer(r2.token, buyer(point.id));
    fake.intentStatus = "succeeded";
    await checkout.syncShopPaymentFromStripe((await orderOf(r2.token)).id);
    expect((await orderOf(r2.token)).status).toBe("PAID");
    // annulation par l'acheteur : produits rendus
    fake.intentStatus = "requires_payment_method";
    const r3 = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await checkout.submitShopBuyer(r3.token, buyer(point.id));
    await checkout.cancelShopReservation(r3.token);
    expect((await orderOf(r3.token)).status).toBe("CANCELLED");
    expect((await variant(s.id)).held).toBe(0);
    await checkout.cancelShopReservation("inconnu");
  });
});

describe("commandes de la boutique : suivi, retrait, remboursement, rétractation (US-SHOP-06, RG-SHOP-09 à RG-SHOP-12)", () => {
  async function paidOrder() {
    const setupData = await setup();
    const { org, point, s, m } = setupData;
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [
        { variantId: s.id, quantity: 2 },
        { variantId: m.id, quantity: 1 },
      ],
      locale: "fr",
    });
    await checkout.submitShopBuyer(r.token, buyer(point.id));
    await pay(r.token);
    return { ...setupData, token: r.token, order: await orderOf(r.token) };
  }

  it("liste filtrée, prête à retirer (e-mail), retirée au code QR une seule fois ; propre à l'organisation", async () => {
    const { ctx, org, order } = await paidOrder();
    const other = await setup();
    expect(
      (await orders.listShopOrders(ctx as never, "TO_PREPARE")).map((o) => [
        o.reference,
        o.items,
        o.buyer,
      ]),
    ).toEqual([[order.reference, 3, "Léa Martin"]]);
    expect(await orders.shopOrdersToPrepare(ctx as never)).toBe(1);
    await orders.markShopOrderReady(ctx as never, order.id);
    await orders.markShopOrderReady(ctx as never, order.id); // déjà prête : rien de plus
    expect(
      await db.emailMessage.count({
        where: { organizationId: org.id, template: "shop.order_ready" },
      }),
    ).toBe(1);
    expect(await orders.listShopOrders(ctx as never, "READY")).toHaveLength(1);
    await expect(
      orders.findShopOrderByPickupCode(other.ctx as never, order.pickupCode),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      orders.findShopOrderByPickupCode(ctx as never, "COURT"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const found = await orders.findShopOrderByPickupCode(
      ctx as never,
      ` ${order.pickupCode.slice(0, 5).toLowerCase()}-${order.pickupCode.slice(5)} `,
    );
    expect(found.id).toBe(order.id);
    await orders.markShopOrderPickedUp(ctx as never, order.id);
    await expect(
      orders.markShopOrderPickedUp(ctx as never, order.id),
    ).rejects.toMatchObject({ code: "SHOP_ALREADY_PICKED_UP" });
    await expect(
      orders.markShopOrderReady(ctx as never, order.id),
    ).resolves.toBeUndefined();
    expect(
      (await orders.listShopOrders(ctx as never, "DONE")).map(
        (o) => o.fulfillmentStatus,
      ),
    ).toEqual(["PICKED_UP"]);
    expect(await orders.listShopOrders(ctx as never, "ALL")).toHaveLength(1);
    await expect(
      orders.getShopOrder(other.ctx as never, order.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await orders.shopOrderUrl(order.id)).toMatch(
      /\/boutique\/commande\/[A-Za-z0-9_-]{43}$/,
    );
  });

  it("remboursement ligne par ligne, articles remis en stock ou non, e-mail ; puis entier ; refus de Stripe signalé", async () => {
    const { ctx, org, order, s, m } = await paidOrder();
    const [ls, lm] = order.lines;
    await expect(
      orders.refundShopOrder(ctx as never, order.id, {
        lines: [{ lineId: ls!.id, quantity: 3 }],
        restock: true,
      }),
    ).rejects.toMatchObject({ code: "SHOP_REFUND_INVALID" });
    await expect(
      orders.refundShopOrder(ctx as never, order.id, {
        lines: [],
        restock: true,
      }),
    ).rejects.toMatchObject({ code: "SHOP_REFUND_INVALID" });
    expect(
      await orders.refundShopOrder(ctx as never, order.id, {
        lines: [{ lineId: ls!.id, quantity: 1 }],
        restock: true,
      }),
    ).toEqual({ amountMinor: 2500 });
    expect(fake.refunds[0]).toMatchObject({ amount: 2500 });
    expect((await variant(s.id)).stock).toBe(2); // 3 - 2 vendus + 1 rendu
    expect(
      await db.shopOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: "PARTIALLY_REFUNDED", refundedMinor: 2500 });
    expect(
      await db.emailMessage.count({
        where: { organizationId: org.id, template: "shop.order_refunded" },
      }),
    ).toBe(1);
    fake.refundFails = true;
    await expect(
      orders.refundShopOrder(ctx as never, order.id, {
        lines: [{ lineId: lm!.id, quantity: 1 }],
        restock: false,
      }),
    ).rejects.toMatchObject({ code: "REFUND_FAILED" });
    expect(
      await db.shopRefund.count({
        where: { orderId: order.id, status: "FAILED" },
      }),
    ).toBe(1);
    fake.refundFails = false;
    await orders.refundShopOrder(ctx as never, order.id, {
      lines: [
        { lineId: ls!.id, quantity: 1 },
        { lineId: lm!.id, quantity: 1 },
      ],
      restock: false,
    });
    expect(
      await db.shopOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: "REFUNDED", refundedMinor: 7700 });
    expect((await variant(m.id)).sold).toBe(1); // sans remise en stock : ventes inchangées
    await expect(
      orders.refundShopOrder(ctx as never, order.id, {
        lines: [{ lineId: lm!.id, quantity: 1 }],
        restock: false,
      }),
    ).rejects.toMatchObject({ code: "SHOP_ORDER_STATE" });
    await expect(
      orders.markShopOrderPickedUp(ctx as never, order.id),
    ).rejects.toMatchObject({ code: "SHOP_ORDER_STATE" });
    // état final reçu de Stripe
    const refund = await db.shopRefund.findFirstOrThrow({
      where: { orderId: order.id, status: "SUCCEEDED" },
    });
    expect(
      await orders.syncShopRefund(
        refund.stripeRefundId!,
        "failed",
        "expired_or_canceled_card",
      ),
    ).toBe(true);
    expect(
      (await db.shopRefund.findUniqueOrThrow({ where: { id: refund.id } }))
        .status,
    ).toBe("FAILED");
    expect(await orders.syncShopRefund(refund.stripeRefundId!, "pending")).toBe(
      true,
    );
    expect(await orders.syncShopRefund("re_inconnu", "succeeded")).toBe(false);
    expect(
      await handleConnectEvent({
        type: "refund.updated",
        data: { object: { id: refund.stripeRefundId, status: "succeeded" } },
      } as never),
    ).toBe("PROCESSED");
  });

  it("rétractation : avant la réception, puis 14 jours après le retrait ; une seule demande ; organisation prévenue (RG-SHOP-11)", async () => {
    const { ctx, org, order, token } = await paidOrder();
    expect((await orders.shopOrderForBuyer(token))?.canWithdraw).toBe(true);
    await orders.requestShopWithdrawal(token);
    await orders.requestShopWithdrawal(token); // déjà demandée : rien de plus
    expect(
      (await db.shopOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .withdrawalRequestedAt,
    ).not.toBeNull();
    expect(
      await db.notification.count({
        where: { organizationId: org.id, type: "SHOP_WITHDRAWAL" },
      }),
    ).toBeGreaterThan(0);
    expect(
      await db.emailMessage.count({
        where: { organizationId: org.id, template: "shop.withdrawal" },
      }),
    ).toBe(1);
    expect(
      (await orders.listShopOrders(ctx as never, "ALL"))[0]!.withdrawal,
    ).toBe(true);
    // retirée il y a 15 jours : délai passé
    const late = await paidOrder();
    await db.shopOrder.update({
      where: { id: late.order.id },
      data: {
        fulfillmentStatus: "PICKED_UP",
        pickedUpAt: new Date(Date.now() - 15 * 86_400_000),
      },
    });
    expect((await orders.shopOrderForBuyer(late.token))?.canWithdraw).toBe(
      false,
    );
    await expect(
      orders.requestShopWithdrawal(late.token),
    ).rejects.toMatchObject({ code: "SHOP_WITHDRAWAL_CLOSED" });
    expect(await orders.shopOrderForBuyer("x".repeat(43))).toBeNull();
    await expect(
      orders.requestShopWithdrawal("x".repeat(43)),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("reçu : lignes, total et TVA de chaque taux, dans la langue de l'acheteur (RG-SHOP-10)", async () => {
    const { order } = await paidOrder();
    const receipt = orders.shopReceipt(order, "fr");
    expect(receipt.lines.map((l) => [l.name, l.quantity])).toEqual([
      ["T-shirt (S)", 2],
      ["T-shirt (M)", 1],
    ]);
    expect(receipt.vat).toEqual([
      { rate: "21", amount: expect.stringMatching(/^13,36\s€$/) },
    ]);
    expect(receipt.shipping).toBeNull();
  });
});

describe("boutique publique : page de paiement et refus de carte", () => {
  it("page de paiement : lignes, lieux de retrait actifs, compte Stripe ; expirée ; inconnue", async () => {
    const { ctx, org, point, s } = await setup();
    const now = new Date();
    const r = await checkout.reserveShopOrder(
      {
        organizationId: org.id,
        lines: [{ variantId: s.id, quantity: 1 }],
        locale: "fr",
      },
      now,
    );
    const closed = await delivery.createPickupPoint(ctx, {
      name: "Bar",
      address: "Rue Basse 2",
    });
    await delivery.setPickupPointActive(ctx, closed.id, false);
    const page = await checkout.shopReservation(r.token, now);
    expect(page).toMatchObject({
      expired: false,
      stripeAccountId: expect.stringMatching(/^acct_/),
    });
    expect(page!.points.map((p) => p.id)).toEqual([point.id]);
    expect(page!.order.lines).toHaveLength(1);
    expect(
      (await checkout.shopReservation(
        r.token,
        new Date(now.getTime() + 16 * 60_000),
      ))!.expired,
    ).toBe(true);
    expect(await checkout.shopReservation("x".repeat(43))).toBeNull();
    expect(await checkout.findShopOrderIdByToken("trop-court")).toBeNull();
    await db.stripeAccount.update({
      where: { organizationId: org.id },
      data: { chargesEnabled: false },
    });
    expect(
      (await checkout.shopReservation(r.token, now))!.stripeAccountId,
    ).toBeNull();
    await expect(
      checkout.submitShopBuyer(r.token, buyer(point.id), now),
    ).rejects.toMatchObject({ code: "PAYMENTS_UNAVAILABLE" });
    await expect(
      checkout.submitShopBuyer("x".repeat(43), buyer(point.id)),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("carte refusée, expirée, provision insuffisante : message clair, réservation gardée ; empreinte enregistrée ; déjà payée", async () => {
    const { org, point, s } = await setup();
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await expect(
      checkout.confirmShopPayment(r.token, "ctoken_12345678", "https://x"),
    ).rejects.toMatchObject({ code: "PAYMENT_INVALID" }); // pas encore d'intention
    await checkout.submitShopBuyer(r.token, buyer(point.id));
    fake.fingerprint = "fp_ok";
    for (const [err, code] of [
      [
        { type: "StripeCardError", decline_code: "insufficient_funds" },
        "CARD_INSUFFICIENT_FUNDS",
      ],
      [{ type: "StripeCardError", code: "expired_card" }, "CARD_EXPIRED"],
      [{ type: "StripeCardError", code: "card_declined" }, "CARD_DECLINED"],
    ] as const) {
      fake.confirmError = err;
      await expect(
        checkout.confirmShopPayment(r.token, "ctoken_12345678", "https://x"),
      ).rejects.toMatchObject({ code });
    }
    fake.confirmError = null;
    fake.confirmStatus = "requires_payment_method";
    await expect(
      checkout.confirmShopPayment(r.token, "ctoken_12345678", "https://x"),
    ).rejects.toMatchObject({ code: "CARD_DECLINED" });
    expect(await orderOf(r.token)).toMatchObject({
      status: "PENDING",
      cardFingerprint: "fp_ok",
    });
    await expect(
      checkout.confirmShopPayment(
        "x".repeat(43),
        "ctoken_12345678",
        "https://x",
      ),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    // intention déjà réussie chez Stripe : la commande est considérée payée
    fake.intentStatus = "succeeded";
    expect(await checkout.submitShopBuyer(r.token, buyer(point.id))).toEqual({
      paid: true,
    });
    await pay(r.token);
    expect(await checkout.submitShopBuyer(r.token, buyer(point.id))).toEqual({
      paid: true,
    });
  });
});
