import { describe, expect, it, vi } from "vitest";
import {
  mollie,
  mollieFetch,
  readyMollieAccount,
  reply,
  useMollieFake,
} from "./helpers/mollieFake";

// Boutique, lot 3b (section 9.35) : panier, réservation atomique, paiement sur le compte Mollie de l'organisation sans
// commission Evoly, validation unique, réservations expirées, retrait au code QR, remboursements, rétractation de
// 14 jours ; Mollie simulé

const { db } = await import("@/lib/db");
const { findOrgContext } = await import("@/server/context");
const shop = await import("@/server/shop");
const delivery = await import("@/server/shopDelivery");
const checkout = await import("@/server/shopCheckout");
const orders = await import("@/server/shopOrders");
const publicShop = await import("@/server/shopPublic");
const { blockBuyer } = await import("@/server/blockedBuyers");
const { POST: webhook } =
  await import("@/app/api/webhooks/mollie/boutique/route");

const rid = () => Math.random().toString(36).slice(2, 10);
useMollieFake();

/** Organisation Pro au compte Mollie prêt, un lieu de retrait, un t-shirt (S : 3 en stock, M : illimité) en vente. */
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
    },
  });
  await readyMollieAccount(org.id, id);
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
const RETURN = "https://theatre.evoly.test/boutique/commande/jeton";
/** « Payer » : coordonnées et mode de remise, puis la page de paiement de Mollie, avec retour sur la commande. */
const submit = (
  token: string,
  b: Parameters<typeof checkout.submitShopBuyer>[1],
  now?: Date,
) => checkout.submitShopBuyer(token, b, now, { returnUrl: RETURN });
/** Le paiement en cours de la commande, payé chez Mollie (carte, empreinte éventuelle). */
function paidAtMollie(
  o: { molliePaymentId: string | null },
  fingerprint: string | null = null,
) {
  const payment = mollie.payments.get(o.molliePaymentId!)!;
  payment.status = "paid";
  payment.method = "creditcard";
  payment.details = fingerprint ? { cardFingerprint: fingerprint } : null;
  return payment;
}
/** Paiement réussi, tel que relu chez Mollie (webhook ou retour de l'acheteur). */
async function pay(token: string, fingerprint: string | null = null) {
  const o = await orderOf(token);
  paidAtMollie(o, fingerprint);
  return checkout.completeShopOrder(o.id, {
    molliePaymentId: o.molliePaymentId!,
    amountMinor: o.totalMinor,
    currency: "EUR",
    paymentMethodType: "creditcard",
    cardFingerprint: fingerprint,
  });
}
/** Webhook Mollie de la boutique : l'identifiant du paiement, la commande dans l'adresse. */
const hook = (id: string, order?: string) =>
  webhook(
    new Request(
      `http://localhost/api/webhooks/mollie/boutique${order ? `?commande=${order}` : ""}`,
      { method: "POST", body: new URLSearchParams({ id }) },
    ),
  );

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
    // la réservation de la commande vit 15 minutes (la durée d'un paiement par carte chez Mollie), puis la tâche
    // planifiée la libère
    await submit(
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
    await expect(submit(r.token, buyer("x"))).rejects.toMatchObject({
      code: "HOLD_EXPIRED",
    });
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
    await expect(submit(r.token, buyer("autre"))).rejects.toMatchObject({
      code: "SHOP_PICKUP_REQUIRED",
    });
    await expect(
      submit(r.token, {
        ...buyer(point.id),
        email: "pas-une-adresse",
      }),
    ).rejects.toMatchObject({ code: "EMAIL_INVALID" });
    await expect(
      submit(r.token, { ...buyer(point.id), lastName: " " }),
    ).rejects.toMatchObject({ code: "BUYER_NAME_REQUIRED" });
    const first = await submit(r.token, buyer(point.id));
    expect(first).toEqual({
      kind: "REDIRECT",
      url: expect.stringMatching(/^https:\/\/www\.mollie\.com\/checkout\//),
    });
    expect(mollie.payments.size).toBe(1);
    const [created] = [...mollie.payments.values()];
    const o = await orderOf(r.token);
    expect(created).toMatchObject({
      amount: { currency: "EUR", value: "77.00" },
      description: `Boutique · ${o.reference}`,
      redirectUrl: RETURN,
      locale: "fr_BE",
      profileId: `pfl_${org.subdomain!.slice(8)}`,
      metadata: { shopOrderId: o.id, reference: o.reference },
    });
    expect(created).not.toHaveProperty("applicationFee"); // RG-SHOP-08 : aucune commission Evoly
    expect(created).not.toHaveProperty("webhookUrl"); // en local : adresse non publique, validée au retour
    // second envoi : le paiement encore ouvert, au même montant, est repris
    expect(await submit(r.token, buyer(point.id))).toEqual(first);
    expect(mollie.payments.size).toBe(1);
    expect(o).toMatchObject({
      pickupName: "Accueil",
      pickupInstructions: "Du mardi au samedi",
      buyerEmailKey: "lea@exemple.be",
      termsVersion: "2026-11",
      molliePaymentId: created!.id,
    });
    expect(await pay(r.token)).toBe("PAID");
    expect(await pay(r.token)).toBe("ALREADY_PAID");
    const paid = await orderOf(r.token);
    expect(paid).toMatchObject({
      status: "PAID",
      paymentMethodType: "creditcard",
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
    // un montant ou un paiement qui ne correspondent pas : ignoré
    const other = {
      molliePaymentId: "tr_autre",
      amountMinor: 1,
      currency: "EUR",
      paymentMethodType: null,
      cardFingerprint: null,
    };
    expect(await checkout.completeShopOrder(paid.id, other)).toBe("IGNORED");
    expect(await checkout.completeShopOrder("inconnue", other)).toBe("IGNORED");
  });

  it("personne bloquée : adresse refusée à la saisie ; carte bloquée connue au paiement, remboursée (RG-BLK-01, RG-BLK-02)", async () => {
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
      submit(r1.token, buyer(point.id, "Nuisible@exemple.be")),
    ).rejects.toMatchObject({ code: "BUYER_BLOCKED" });
    expect((await orderOf(r1.token)).status).toBe("CANCELLED");
    expect((await variant(s.id)).held).toBe(0);
    expect(mollie.payments.size).toBe(0); // aucun paiement créé
    // carte bloquée : son empreinte n'est connue qu'au paiement ; payée, la commande est remboursée et annulée
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
    await submit(r2.token, buyer(point.id));
    expect((await variant(s.id)).held).toBe(1);
    expect(await pay(r2.token, "fp_bloquee")).toBe("BLOCKED");
    const o2 = await orderOf(r2.token);
    expect(o2).toMatchObject({
      status: "CANCELLED",
      refundedMinor: 2500,
      cardFingerprint: "fp_bloquee",
      paidAt: null,
    });
    expect((await variant(s.id)).held).toBe(0); // produits rendus à la vente
    expect(mollie.refunds).toEqual([
      expect.objectContaining({
        paymentId: o2.molliePaymentId,
        amount: { currency: "EUR", value: "25.00" },
        metadata: { shopOrderId: o2.id, cause: "blocked" },
      }),
    ]);
    // webhook rejoué : déjà remboursée, rien de plus
    expect(await checkout.syncShopPaymentFromMollie(o2.id)).toBe("paid");
    expect(mollie.refunds).toHaveLength(1);
    // une carte non bloquée passe
    const r3 = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await submit(r3.token, buyer(point.id));
    expect(await pay(r3.token, "fp_ok")).toBe("PAID");
    expect((await orderOf(r3.token)).cardFingerprint).toBe("fp_ok");
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
    await submit(late.token, buyer(point.id), now);
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
    await submit(other.token, buyer(point.id), now);
    await checkout.releaseExpiredShopHolds(
      new Date(now.getTime() + 20 * 60_000),
    );
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 0 } });
    expect(await pay(other.token)).toBe("REFUND_REQUIRED");
    expect(await orderOf(other.token)).toMatchObject({
      status: "CANCELLED",
      refundedMinor: 2500,
    });
    expect(mollie.refunds.at(-1)).toMatchObject({
      paymentId: (await orderOf(other.token)).molliePaymentId,
      amount: { currency: "EUR", value: "25.00" },
      metadata: { cause: "unfulfilled" },
    });
  });

  it("webhook et retour de Mollie : validée une seule fois ; paiement abandonné puis repris ; identifiants inconnus ignorés", async () => {
    const { org, point, s } = await setup();
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await submit(r.token, buyer(point.id));
    const o = await orderOf(r.token);
    // paiement encore ouvert : rien ne change
    expect((await hook(o.molliePaymentId!, o.id)).status).toBe(200);
    expect((await orderOf(r.token)).status).toBe("PENDING");
    // payé : la commande est validée, une seule fois (webhook rejoué, sans la commande dans l'adresse)
    paidAtMollie(o);
    expect((await hook(o.molliePaymentId!, o.id)).status).toBe(200);
    expect((await hook(o.molliePaymentId!)).status).toBe(200);
    expect(await orderOf(r.token)).toMatchObject({
      status: "PAID",
      paymentMethodType: "creditcard",
    });
    expect(
      await db.emailMessage.count({
        where: { organizationId: org.id, template: "shop.order_confirmed" },
      }),
    ).toBe(1);
    // identifiants inconnus, mal formés ou d'un autre compte Mollie : ignorés ; formulaire sans identifiant : refusé
    expect((await hook("tr_inconnu")).status).toBe(200);
    expect((await hook("pas-un-paiement", o.id)).status).toBe(200);
    expect((await hook("tr_inconnu", o.id)).status).toBe(200);
    expect((await hook("tr_inconnu", "pas une commande")).status).toBe(200);
    expect(
      (
        await webhook(
          new Request("http://localhost/api/webhooks/mollie/boutique", {
            method: "POST",
            body: new URLSearchParams({}),
          }),
        )
      ).status,
    ).toBe(400);
    // Mollie indisponible : erreur, et Mollie relance plus tard
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply({ status: 503, title: "Unavailable" }, 503)),
    );
    expect((await hook(o.molliePaymentId!, o.id)).status).toBe(500);
    vi.stubGlobal("fetch", vi.fn(mollieFetch));
    // paiement abandonné chez Mollie : réservation gardée, nouveau paiement au nouvel essai, validé au retour
    const r2 = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await submit(r2.token, buyer(point.id));
    const o2 = await orderOf(r2.token);
    mollie.payments.get(o2.molliePaymentId!)!.status = "canceled";
    expect(await checkout.syncShopPaymentFromMollie(o2.id)).toBe("canceled");
    expect((await orderOf(r2.token)).status).toBe("PENDING");
    await submit(r2.token, buyer(point.id));
    const retried = await orderOf(r2.token);
    expect(retried.molliePaymentId).not.toBe(o2.molliePaymentId);
    paidAtMollie(retried);
    expect(await checkout.syncShopPaymentFromMollie(retried.id)).toBe("paid");
    expect((await orderOf(r2.token)).status).toBe("PAID");
    expect(mollie.refunds).toHaveLength(0);
    // sans paiement ou commande inconnue : rien à relire
    expect(await checkout.syncShopPaymentFromMollie("inconnue")).toBeNull();
  });

  it("paiement reçu sans commande à servir : remplacé (mode de remise changé) ou après une annulation, remboursé une fois", async () => {
    const { ctx, org, point, product, m } = await setup();
    await db.product.update({
      where: { id: product.id },
      data: { shippingEnabled: true },
    });
    const colis = await delivery.createShippingMethod(ctx, {
      name: "Colis",
      price: "4,90",
    });
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: m.id, quantity: 1 }],
      locale: "fr",
    });
    await submit(r.token, buyer(point.id)); // retrait : 27 €
    const first = (await orderOf(r.token)).molliePaymentId!;
    await submit(r.token, {
      ...buyer(point.id),
      mode: "SHIPPING",
      shippingMethodId: colis.id,
      address: {
        name: "Léa Martin",
        line1: "Rue Neuve 3",
        postalCode: "1000",
        city: "Bruxelles",
        country: "BE",
      },
    }); // livraison : 31,90 €, un nouveau paiement
    const o = await orderOf(r.token);
    expect(o.totalMinor).toBe(3190);
    expect(o.molliePaymentId).not.toBe(first);
    expect(mollie.payments.get(o.molliePaymentId!)!.amount.value).toBe("31.90");
    // l'ancien paiement, payé dans un autre onglet : remboursé ; la commande attend le nouveau
    mollie.payments.get(first)!.status = "paid";
    expect((await hook(first, o.id)).status).toBe(200);
    expect(mollie.refunds).toEqual([
      expect.objectContaining({
        paymentId: first,
        amount: { currency: "EUR", value: "27.00" },
        metadata: { shopOrderId: o.id, cause: "superseded" },
      }),
    ]);
    expect((await orderOf(r.token)).status).toBe("PENDING");
    expect((await hook(first, o.id)).status).toBe(200); // rejoué : déjà remboursé
    expect(mollie.refunds).toHaveLength(1);
    // le paiement d'une autre commande n'est jamais traité pour celle-ci
    const r2 = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: m.id, quantity: 1 }],
      locale: "fr",
    });
    expect(
      await checkout.syncShopPaymentFromMollie(
        (await orderOf(r2.token)).id,
        o.molliePaymentId!,
      ),
    ).toBeNull();
    // réservation annulée par l'acheteur (produits rendus), payée malgré tout chez Mollie : remboursée en entier
    await submit(r2.token, buyer(point.id));
    await checkout.cancelShopReservation(r2.token);
    const o2 = await orderOf(r2.token);
    expect(o2.status).toBe("CANCELLED");
    expect((await variant(m.id)).held).toBe(1); // seule la commande en attente retient encore
    paidAtMollie(o2);
    expect((await hook(o2.molliePaymentId!, o2.id)).status).toBe(200);
    expect(await orderOf(r2.token)).toMatchObject({
      status: "CANCELLED",
      refundedMinor: 2700,
      paidAt: null,
    });
    expect(mollie.refunds.at(-1)).toMatchObject({
      paymentId: o2.molliePaymentId,
      metadata: { cause: "cancelled" },
    });
    expect((await hook(o2.molliePaymentId!, o2.id)).status).toBe(200);
    expect(mollie.refunds).toHaveLength(2);
    await checkout.cancelShopReservation(r2.token); // déjà annulée : rien de plus
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
    await submit(r.token, buyer(point.id));
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

  it("remboursement ligne par ligne sur le paiement Mollie, articles remis en stock ou non, e-mail ; puis entier ; refus de Mollie signalé ; état final suivi", async () => {
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
    expect(mollie.refunds[0]).toMatchObject({
      paymentId: order.molliePaymentId,
      amount: { currency: "EUR", value: "25.00" },
      metadata: { shopOrderId: order.id },
    });
    expect((await variant(s.id)).stock).toBe(2); // 3 - 2 vendus + 1 rendu
    expect(
      await db.shopOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: "PARTIALLY_REFUNDED", refundedMinor: 2500 });
    expect(
      await db.emailMessage.count({
        where: { organizationId: org.id, template: "shop.order_refunded" },
      }),
    ).toBe(1);
    mollie.refundFails = true;
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
    mollie.refundFails = false;
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
    // en attente chez Mollie, puis état final relu sur le paiement (webhook) : remboursé, ou échoué
    expect(
      await db.shopRefund.count({
        where: { orderId: order.id, status: "PROCESSING" },
      }),
    ).toBe(2);
    mollie.refunds[0]!.status = "refunded";
    mollie.refunds[1]!.status = "failed";
    expect((await hook(order.molliePaymentId!, order.id)).status).toBe(200);
    const states = await db.shopRefund.findMany({
      where: { orderId: order.id, mollieRefundId: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    expect(states.map((x) => [x.status, x.failureReason])).toEqual([
      ["SUCCEEDED", null],
      ["FAILED", "échec Mollie"],
    ]);
    // plus rien en attente : le paiement n'est pas relu pour ses remboursements
    const calls = vi.mocked(fetch).mock.calls.length;
    expect((await hook(order.molliePaymentId!, order.id)).status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls + 1);
  });

  it("remboursement : compte Mollie délié ou paiement introuvable, refusé avant tout", async () => {
    const { ctx, order } = await paidOrder();
    await db.mollieAccount.delete({
      where: { organizationId: order.organizationId },
    });
    await expect(
      orders.refundShopOrder(ctx as never, order.id, {
        lines: [{ lineId: order.lines[0]!.id, quantity: 1 }],
        restock: false,
      }),
    ).rejects.toMatchObject({ code: "MOLLIE_RECONNECT_REQUIRED" });
    expect(await db.shopRefund.count({ where: { orderId: order.id } })).toBe(0);
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

describe("boutique publique : page de paiement", () => {
  it("page de paiement : lignes, lieux de retrait actifs, compte Mollie prêt ; expirée ; inconnue", async () => {
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
    expect(page).toMatchObject({ expired: false, payable: true });
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
    // sans adresse de retour (site visité illisible) : pas de paiement
    await expect(
      checkout.submitShopBuyer(r.token, buyer(point.id), now),
    ).rejects.toMatchObject({ code: "PAYMENTS_UNAVAILABLE" });
    await db.mollieAccount.update({
      where: { organizationId: org.id },
      data: { disconnectedAt: new Date() },
    });
    expect((await checkout.shopReservation(r.token, now))!.payable).toBe(false);
    await expect(submit(r.token, buyer(point.id), now)).rejects.toMatchObject({
      code: "PAYMENTS_UNAVAILABLE",
    });
    await expect(submit("x".repeat(43), buyer(point.id))).rejects.toMatchObject(
      { code: "ORDER_NOT_FOUND" },
    );
  });

  it("paiement déjà reçu chez Mollie (autre onglet) : « Payer » valide la commande sans nouveau paiement", async () => {
    const { org, point, s } = await setup();
    const r = await checkout.reserveShopOrder({
      organizationId: org.id,
      lines: [{ variantId: s.id, quantity: 1 }],
      locale: "fr",
    });
    await submit(r.token, buyer(point.id));
    paidAtMollie(await orderOf(r.token), "fp_ok");
    expect(await submit(r.token, buyer(point.id))).toEqual({ kind: "PAID" });
    expect(await orderOf(r.token)).toMatchObject({
      status: "PAID",
      cardFingerprint: "fp_ok",
    });
    expect(mollie.payments.size).toBe(1);
    expect(await submit(r.token, buyer(point.id))).toEqual({ kind: "PAID" });
  });
});
