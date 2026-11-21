import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cancelReservation,
  finalizeOrder,
  releaseExpiredHolds,
  reserveOrder,
} from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import {
  createOption,
  listOptions,
  optionsForTicket,
  publicOptions,
  updateOption,
} from "@/server/options";
import {
  createProduct,
  deleteProduct,
  saveProductOptions,
  saveVariants,
} from "@/server/shop";
import { cartPreview } from "@/server/shopCheckout";

// Boutique, lot 3c (section 9.35) : un produit de la boutique proposé en option d'un événement ; l'acheteur choisit la
// variante pendant l'achat des billets ; un seul stock pour la boutique et les événements ; retrait à l'événement
const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const owner = await db.user.create({
    data: { name: "Nora", email: `opt.${id}@exemple.be`, emailVerified: true },
  });
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
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
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `concert-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Concert ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Entrée",
          priceMinor: 1000,
          currency: "EUR",
          quantity: 100,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const product = await createProduct(ctx, {
    name: "T-shirt de la tournée",
    price: "25",
    vatRate: "21",
    description: "Coton bio",
  });
  await saveProductOptions(ctx, product.id, [
    { name: "Taille", values: [{ name: "S" }, { name: "M" }] },
  ]);
  const [s, m] = await db.productVariant.findMany({
    where: { productId: product.id },
    orderBy: { sortOrder: "asc" },
  });
  await saveVariants(ctx, product.id, [
    { id: s!.id, stock: "2", active: true },
    { id: m!.id, stock: "", priceDelta: "3", active: true },
  ]);
  return {
    ctx,
    org,
    event,
    type: event.ticketTypes[0]!,
    product,
    s: s!,
    m: m!,
  };
}
const variant = (id: string) =>
  db.productVariant.findUniqueOrThrow({ where: { id } });

describe("produits de la boutique en option des événements (US-SHOP-07, RG-SHOP-13)", () => {
  it("l'option reprend le produit : nom et prix de la boutique, stock partagé ; proposée variante par variante", async () => {
    const { ctx, event, product, s, m } = await setup();
    const opt = await createOption(ctx, event.id, {
      name: "",
      price: "",
      productId: product.id,
      maxPerOrder: "4",
      standalone: true,
    });
    expect(opt).toMatchObject({
      productId: product.id,
      name: "T-shirt de la tournée",
      priceMinor: 2500,
      stock: null,
      description: "Coton bio",
    });
    const rows = await publicOptions(event.id, ctx.features);
    expect(rows.map((r) => [r.id, r.name, r.priceMinor, r.left])).toEqual([
      [`${opt.id}:${s.id}`, "T-shirt de la tournée (S)", 2500, 2],
      [`${opt.id}:${m.id}`, "T-shirt de la tournée (M)", 2800, null],
    ]);
    const [listed] = await listOptions(ctx, event.id);
    expect(listed).toMatchObject({ productId: product.id, shopStock: null });
    // une option libre peut devenir un produit, et inversement
    const free = await createOption(ctx, event.id, {
      name: "Vestiaire",
      price: "2",
    });
    await updateOption(ctx, event.id, free.id, {
      name: "",
      price: "",
      productId: product.id,
    });
    expect(
      await db.eventOption.findUniqueOrThrow({ where: { id: free.id } }),
    ).toMatchObject({ productId: product.id, name: "T-shirt de la tournée" });
    await updateOption(ctx, event.id, free.id, {
      name: "Vestiaire",
      price: "2",
    });
    expect(
      await db.eventOption.findUniqueOrThrow({ where: { id: free.id } }),
    ).toMatchObject({ productId: null, name: "Vestiaire", priceMinor: 200 });
    await expect(
      createOption(ctx, event.id, {
        name: "",
        price: "",
        productId: "inconnu",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // un produit proposé en option ne se supprime pas
    await expect(deleteProduct(ctx, product.id)).rejects.toMatchObject({
      code: "SHOP_PRODUCT_IN_EVENT",
    });
  });

  it("achat des billets avec la variante choisie : stock retenu, puis vendu, pour la boutique aussi ; aucune commission sur le produit", async () => {
    const { ctx, org, event, type, product, s, m } = await setup();
    const opt = await createOption(ctx, event.id, {
      name: "",
      price: "",
      productId: product.id,
    });
    const cart = (variantId: string, quantity: number) => ({
      eventId: event.id,
      lines: [{ ticketTypeId: type.id, quantity: 1 }],
      locale: "fr",
      options: [{ optionId: opt.id, variantId, quantity }],
    });
    const r = await reserveOrder(cart(s.id, 2));
    expect(r.options).toEqual([
      {
        optionId: opt.id,
        name: "T-shirt de la tournée (S)",
        quantity: 2,
        unitPriceMinor: 2500,
      },
    ]);
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
      include: { options: true },
    });
    expect(order.totalMinor).toBe(1000 + 2 * 2500);
    expect(order.options[0]).toMatchObject({
      productVariantId: s.id,
      variantLabel: "S",
      unitFeeMinor: 0,
    });
    expect((await variant(s.id)).held).toBe(2);
    // la boutique voit le même stock : plus rien en S
    expect(
      (await cartPreview(org.id, [{ variantId: s.id, quantity: 1 }]))[0]!
        .problem,
    ).toBe("UNAVAILABLE");
    await expect(reserveOrder(cart(s.id, 1))).rejects.toMatchObject({
      code: "OPTION_SOLD_OUT",
    });
    await expect(
      reserveOrder({
        ...cart(s.id, 1),
        options: [{ optionId: opt.id, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "OPTION_VARIANT_REQUIRED" });
    const other = await createProduct(ctx, {
      name: "Affiche",
      price: "15",
      vatRate: "21",
    });
    const [ov] = await db.productVariant.findMany({
      where: { productId: other.id },
    });
    await expect(reserveOrder(cart(ov!.id, 1))).rejects.toMatchObject({
      code: "OPTION_UNAVAILABLE",
    });
    await db.order.update({
      where: { id: r.orderId },
      data: {
        buyerEmail: "lea@exemple.be",
        buyerFirstName: "Léa",
        buyerLastName: "Martin",
      },
    });
    expect(await finalizeOrder(r.orderId)).toBe("PAID");
    expect(await variant(s.id)).toMatchObject({ stock: 0, held: 0, sold: 2 });
    // retrait à l'événement, comme les autres options
    const ticket = await db.ticket.findFirstOrThrow({
      where: { orderId: r.orderId },
    });
    expect((await optionsForTicket(event.id, ticket.id))[0]).toMatchObject({
      name: "T-shirt de la tournée (S)",
      quantity: 2,
    });
    // variante M (sans limite) : prix avec le supplément
    const r2 = await reserveOrder(cart(m.id, 1));
    expect(r2.options![0]!.unitPriceMinor).toBe(2800);
  });

  it("réservation abandonnée, expirée, annulée : la variante est rendue ; paiement tardif sans stock : remboursement requis", async () => {
    const { ctx, event, type, product, s } = await setup();
    const opt = await createOption(ctx, event.id, {
      name: "",
      price: "",
      productId: product.id,
    });
    const cart = {
      eventId: event.id,
      lines: [{ ticketTypeId: type.id, quantity: 1 }],
      locale: "fr",
      options: [{ optionId: opt.id, variantId: s.id, quantity: 1 }],
    };
    const old = await reserveOrder(cart, new Date(Date.now() - 60 * 60_000));
    expect((await variant(s.id)).held).toBe(1);
    expect(await releaseExpiredHolds()).toBeGreaterThan(0);
    expect((await variant(s.id)).held).toBe(0);
    const r = await reserveOrder(cart);
    await cancelReservation(r.token);
    expect((await variant(s.id)).held).toBe(0);
    // paiement arrivé après l'expiration, le stock repris entre-temps
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 0 } });
    await db.order.update({
      where: { id: old.orderId },
      data: {
        buyerEmail: "lea@exemple.be",
        buyerFirstName: "Léa",
        buyerLastName: "Martin",
      },
    });
    expect(await finalizeOrder(old.orderId)).toBe("REFUND_REQUIRED");
    await db.productVariant.update({ where: { id: s.id }, data: { stock: 5 } });
    expect(await finalizeOrder(old.orderId)).toBe("PAID");
    expect(await variant(s.id)).toMatchObject({ stock: 4, sold: 1 });
  });
});
