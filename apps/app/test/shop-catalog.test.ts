import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { uploadImage } from "@/server/brand";
import { findOrgContext, type OrgContext } from "@/server/context";
import {
  addProductImage,
  createProduct,
  defaultVatRateBps,
  deleteProduct,
  getProductForEdit,
  listProducts,
  moveProductImage,
  removeProductImage,
  saveProductOptions,
  saveVariants,
  setProductFeatured,
  setProductImageAlt,
  setProductStatus,
  updateProduct,
} from "@/server/shop";
import {
  createPickupPoint,
  createShippingMethod,
  deletePickupPoint,
  deleteShippingMethod,
  listPickupPoints,
  listShippingMethods,
  setPickupPointActive,
  setShippingMethodActive,
  updatePickupPoint,
  updateShippingMethod,
} from "@/server/shopDelivery";
import { publicFileUrl } from "@/server/storage";

// Boutique, lot 3a (section 9.35) : catalogue (produits, options, variantes, photos), lieux de retrait et modes de
// livraison, réservés à l'offre Pro, propres à chaque organisation
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(plan: "free" | "pro" = "pro"): Promise<OrgContext> {
  const id = rid();
  const owner = await db.user.create({
    data: { name: "Nora", email: `shop.${id}@exemple.be`, emailVerified: true },
  });
  const org = await db.organization.create({
    data: {
      name: `Atelier ${id}`,
      slug: `atelier-${id}`,
      subdomain: `atelier-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
      ...(plan === "pro"
        ? {
            subscription: {
              create: {
                planId: "pro",
                currency: "EUR",
                status: "ACTIVE",
                currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
              },
            },
          }
        : {}),
    },
  });
  const role = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: { organizationId: org.id, userId: owner.id, roleId: role.id },
  });
  return {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: "Nora", email: owner.email },
  };
}

const tshirt = { name: "T-shirt", price: "25", vatRate: "21" };
const variantsOf = (productId: string) =>
  db.productVariant.findMany({
    where: { productId },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
  });

describe("boutique : catalogue (US-SHOP-01, US-SHOP-02)", () => {
  it("offre gratuite : refusé (RG-SHOP-01)", async () => {
    const ctx = await setup("free");
    await expect(createProduct(ctx, tshirt)).rejects.toMatchObject({
      code: "PRO_REQUIRED",
    });
    await expect(listProducts(ctx)).rejects.toMatchObject({
      code: "PRO_REQUIRED",
    });
    await expect(listPickupPoints(ctx)).rejects.toMatchObject({
      code: "PRO_REQUIRED",
    });
  });

  it("création : brouillon avec sa variante unique, adresse unique, prix et TVA contrôlés (RG-SHOP-02)", async () => {
    const ctx = await setup();
    const p = await createProduct(ctx, {
      ...tshirt,
      description: "  Coton bio  ",
      stock: "10",
    });
    expect(p).toMatchObject({
      status: "DRAFT",
      priceMinor: 2500,
      vatRateBps: 2100,
      currency: "EUR",
      slug: "t-shirt",
      description: "Coton bio",
      pickupEnabled: true,
      shippingEnabled: false,
    });
    expect(await variantsOf(p.id)).toMatchObject([
      { key: "", label: "", stock: 10, held: 0, sold: 0, active: true },
    ]);
    expect((await createProduct(ctx, tshirt)).slug).toBe("t-shirt-2");
    expect(
      (await createProduct(ctx, { ...tshirt, price: "12,5", vatRate: "5,5" }))
        .vatRateBps,
    ).toBe(550);
    for (const [input, code] of [
      [{ ...tshirt, name: "  " }, "SHOP_NAME_REQUIRED"],
      [{ ...tshirt, price: "0,50" }, "SHOP_PRICE_INVALID"],
      [{ ...tshirt, price: "abc" }, "SHOP_PRICE_INVALID"],
      [{ ...tshirt, vatRate: "35" }, "SHOP_VAT_INVALID"],
      [{ ...tshirt, stock: "-1" }, "SHOP_STOCK_INVALID"],
      [{ ...tshirt, stock: "2,5" }, "SHOP_STOCK_INVALID"],
    ] as const)
      await expect(createProduct(ctx, input)).rejects.toMatchObject({ code });
    expect(defaultVatRateBps("BE")).toBe(2100);
    expect(defaultVatRateBps("fr")).toBe(2000);
    expect(defaultVatRateBps("US")).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: ctx.organization.id,
          action: "shop.product_created",
        },
      }),
    ).toBe(3);
  });

  it("options : une variante par combinaison, stock gardé, combinaison vendue mise de côté, noms échangés (RG-SHOP-03)", async () => {
    const ctx = await setup();
    const p = await createProduct(ctx, tshirt);
    await saveProductOptions(ctx, p.id, [
      { name: " Taille ", values: [{ name: "S" }, { name: "M" }] },
    ]);
    let variants = await variantsOf(p.id);
    expect(variants.map((v) => v.label)).toEqual(["S", "M"]); // la variante unique, jamais vendue, est supprimée
    const product = await getProductForEdit(ctx, p.id);
    const taille = product.optionGroups[0]!;
    const [s, m] = taille.values;
    const vs = variants.find((v) => v.label === "S")!;
    const vm = variants.find((v) => v.label === "M")!;
    await saveVariants(ctx, p.id, [
      { id: vs.id, stock: "5", priceDelta: "", active: true },
      { id: vm.id, stock: "", priceDelta: "2,50", active: true },
    ]);
    await db.productVariant.update({
      where: { id: vm.id },
      data: { sold: 1 },
    });
    // M retiré (déjà vendu : mis de côté), L ajouté, S garde son stock
    await saveProductOptions(ctx, p.id, [
      {
        id: taille.id,
        name: "Taille",
        values: [{ id: s!.id, name: "S" }, { name: "L" }],
      },
    ]);
    variants = await variantsOf(p.id);
    expect(
      variants.map((v) => [v.label, v.stock, v.priceDeltaMinor, v.active]),
    ).toEqual([
      ["S", 5, 0, true],
      ["L", null, 0, true],
      ["M", null, 250, false],
    ]);
    // M revient : la même variante, remise en vente, avec ses ventes
    await saveProductOptions(ctx, p.id, [
      {
        id: taille.id,
        name: "Taille",
        values: [{ id: s!.id, name: "S" }, { name: "M" }],
      },
    ]);
    expect(
      (await variantsOf(p.id)).map((v) => [v.label, v.active, v.sold]),
    ).toEqual([
      ["S", true, 0],
      ["M", true, 0],
      ["M", false, 1],
    ]); // nouvelle valeur « M » : nouvel identifiant, donc nouvelle combinaison ; l'ancienne reste pour ses commandes
    // deux options qui échangent leurs noms dans le même enregistrement, et les noms de deux valeurs
    const now = await getProductForEdit(ctx, p.id);
    const g = now.optionGroups[0]!;
    await saveProductOptions(ctx, p.id, [
      {
        id: g.id,
        name: "Couleur",
        values: g.values.map((v) => ({
          id: v.id,
          name: v.name === "S" ? "M" : "S",
        })),
      },
      { name: "Taille", values: [{ name: "Unique" }] },
    ]);
    const after = await getProductForEdit(ctx, p.id);
    expect(after.optionGroups.map((x) => x.name)).toEqual([
      "Couleur",
      "Taille",
    ]);
    expect(after.optionGroups[0]!.values.map((v) => v.name)).toEqual([
      "M",
      "S",
    ]);
    // plus aucune option : la variante unique revient
    await saveProductOptions(ctx, p.id, [
      { name: "", values: [] }, // option entièrement vide : ignorée
    ]);
    expect(
      (await variantsOf(p.id)).filter((v) => v.active).map((v) => v.key),
    ).toEqual([""]);
    expect(
      await db.productOptionGroup.count({ where: { productId: p.id } }),
    ).toBe(0);
  });

  it("options : limites et noms contrôlés", async () => {
    const ctx = await setup();
    const p = await createProduct(ctx, tshirt);
    const values = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `V${i}` }));
    for (const [groups, code] of [
      [
        [
          { name: "A", values: values(1) },
          { name: "B", values: values(1) },
          { name: "C", values: values(1) },
          { name: "D", values: values(1) },
        ],
        "SHOP_TOO_MANY_OPTIONS",
      ],
      [
        [
          { name: "Taille", values: values(1) },
          { name: "taille", values: values(1) },
        ],
        "SHOP_OPTION_DUPLICATE",
      ],
      [
        [{ name: "Taille", values: [{ name: "M" }, { name: " m " }] }],
        "SHOP_OPTION_DUPLICATE",
      ],
      [[{ name: "Taille", values: [] }], "SHOP_OPTION_VALUES_REQUIRED"],
      [[{ name: "Taille", values: values(21) }], "SHOP_TOO_MANY_VALUES"],
      [
        [
          { name: "A", values: values(11) },
          { name: "B", values: values(10) },
        ],
        "SHOP_TOO_MANY_VARIANTS",
      ],
      [[{ name: " ", values: values(2) }], "SHOP_OPTION_NAME_REQUIRED"],
    ] as const)
      await expect(
        saveProductOptions(ctx, p.id, groups as never),
      ).rejects.toMatchObject({ code });
  });

  it("stock : jamais sous les paniers en cours ; un produit en vente garde une variante active (RG-SHOP-04)", async () => {
    const ctx = await setup();
    await createPickupPoint(ctx, { name: "Accueil", address: "Rue Haute 1" });
    const p = await createProduct(ctx, { ...tshirt, stock: "10" });
    const [v] = await variantsOf(p.id);
    await db.productVariant.update({
      where: { id: v!.id },
      data: { held: 3 },
    });
    await expect(
      saveVariants(ctx, p.id, [{ id: v!.id, stock: "2", active: true }]),
    ).rejects.toMatchObject({ code: "SHOP_STOCK_BELOW_HELD" });
    await saveVariants(ctx, p.id, [
      { id: v!.id, stock: "3", priceDelta: "1", active: true },
    ]);
    expect(await variantsOf(p.id)).toMatchObject([
      { stock: 3, held: 3, priceDeltaMinor: 100 },
    ]);
    await expect(
      saveVariants(ctx, p.id, [
        { id: v!.id, stock: "", priceDelta: "abc", active: true },
      ]),
    ).rejects.toMatchObject({ code: "SHOP_AMOUNT_INVALID" });
    await expect(
      saveVariants(ctx, p.id, [{ id: "inconnue", stock: "", active: true }]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await setProductStatus(ctx, p.id, "ON_SALE");
    await expect(
      saveVariants(ctx, p.id, [{ id: v!.id, stock: "5", active: false }]),
    ).rejects.toMatchObject({ code: "SHOP_NO_VARIANT" });
    // sans limite : les paniers en cours ne bloquent rien
    await saveVariants(ctx, p.id, [{ id: v!.id, stock: "", active: true }]);
    expect((await variantsOf(p.id))[0]!.stock).toBeNull();
  });

  it("mise en vente : une variante active et un mode de remise réellement proposé (RG-SHOP-05) ; liste du catalogue", async () => {
    const ctx = await setup();
    const p = await createProduct(ctx, { ...tshirt, stock: "4" });
    await expect(setProductStatus(ctx, p.id, "ON_SALE")).rejects.toMatchObject({
      code: "SHOP_NO_PICKUP_POINT",
    });
    const point = await createPickupPoint(ctx, {
      name: "Accueil",
      address: "Rue Haute 1, 1000 Bruxelles",
    });
    await setProductStatus(ctx, p.id, "ON_SALE");
    await expect(
      updateProduct(ctx, p.id, {
        ...tshirt,
        pickupEnabled: false,
        shippingEnabled: false,
      }),
    ).rejects.toMatchObject({ code: "SHOP_NO_FULFILLMENT" });
    await expect(
      updateProduct(ctx, p.id, {
        ...tshirt,
        pickupEnabled: false,
        shippingEnabled: true,
      }),
    ).rejects.toMatchObject({ code: "SHOP_NO_SHIPPING_METHOD" });
    await createShippingMethod(ctx, { name: "Colis", price: "4,90" });
    await updateProduct(ctx, p.id, {
      ...tshirt,
      name: "T-shirt noir",
      pickupEnabled: false,
      shippingEnabled: true,
      featured: true,
    });
    await setPickupPointActive(ctx, point.id, false);
    await setProductFeatured(ctx, p.id, false);
    // un produit sans variante active ne se met pas en vente
    const q = await createProduct(ctx, { ...tshirt, name: "Affiche" });
    const [qv] = await variantsOf(q.id);
    await saveVariants(ctx, q.id, [{ id: qv!.id, stock: "", active: false }]);
    await expect(setProductStatus(ctx, q.id, "ON_SALE")).rejects.toMatchObject({
      code: "SHOP_NO_VARIANT",
    });
    await expect(
      updateProduct(ctx, q.id, {
        ...tshirt,
        name: "Affiche",
        pickupEnabled: false,
      }),
    ).resolves.toBeUndefined(); // brouillon : rien à vérifier
    await setProductStatus(ctx, q.id, "ARCHIVED");
    // un produit à options : prix « à partir de », stock des variantes actives, ventes
    const r = await createProduct(ctx, { ...tshirt, name: "Sweat" });
    await saveProductOptions(ctx, r.id, [
      { name: "Taille", values: [{ name: "S" }, { name: "XL" }] },
    ]);
    const rv = await variantsOf(r.id);
    await saveVariants(
      ctx,
      r.id,
      rv.map((v) => ({
        id: v.id,
        stock: v.label === "S" ? "2" : "6",
        priceDelta: v.label === "XL" ? "3" : "",
        active: true,
      })),
    );
    await db.productVariant.update({
      where: { id: rv[0]!.id },
      data: { sold: 7, held: 1 },
    });
    const rows = await listProducts(ctx);
    expect(rows.map((x) => [x.name, x.status, x.featured])).toEqual([
      ["T-shirt noir", "ON_SALE", false],
      ["Affiche", "ARCHIVED", false],
      ["Sweat", "DRAFT", false],
    ]);
    expect(rows[0]).toMatchObject({
      stock: 4,
      sold: 0,
      priceMinMinor: 2500,
      priceMaxMinor: 2500,
      shippingEnabled: true,
      pickupEnabled: false,
    });
    expect(rows[1]).toMatchObject({ variants: 0, stock: 0 });
    expect(rows[2]).toMatchObject({
      priceMinMinor: 2500,
      priceMaxMinor: 2800,
      stock: 1 + 6,
      sold: 7,
      variants: 2,
      imageUrl: null,
    });
  });

  it("suppression d'un produit jamais vendu, photos comprises ; vendu, il s'archive (RG-SHOP-06)", async () => {
    const ctx = await setup();
    const p = await createProduct(ctx, tshirt);
    await deleteProduct(ctx, p.id);
    expect(await db.product.count({ where: { id: p.id } })).toBe(0);
    const q = await createProduct(ctx, tshirt);
    await db.productVariant.updateMany({
      where: { productId: q.id },
      data: { sold: 1 },
    });
    await expect(deleteProduct(ctx, q.id)).rejects.toMatchObject({
      code: "SHOP_PRODUCT_SOLD",
    });
  });

  it("photos : importées dans le dossier de l'organisation seulement, 10 au plus, ordre, texte alternatif, retrait", async () => {
    const ctx = await setup();
    const p = await createProduct(ctx, tshirt);
    const sharp = (await import("sharp")).default;
    const png = new Uint8Array(
      await sharp({
        create: {
          width: 2400,
          height: 1200,
          channels: 4,
          background: { r: 255, g: 0, b: 128, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer(),
    );
    const url = await uploadImage(ctx, "product", png, p.id);
    expect(url).toMatch(
      new RegExp(
        `^${publicFileUrl(`orgs/${ctx.organization.id}/products/${p.id}-`).replace(/[.]/g, "\\.")}[a-z0-9]+\\.png$`,
      ),
    );
    await expect(
      uploadImage(ctx, "product", png, "inconnu"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addProductImage(ctx, p.id, "https://ailleurs.example/photo.png"),
    ).rejects.toMatchObject({ code: "UPLOAD_INVALID" });
    const prefix = publicFileUrl(`orgs/${ctx.organization.id}/products/`);
    const first = await addProductImage(ctx, p.id, url);
    const second = await addProductImage(ctx, p.id, `${prefix}b.png`);
    const third = await addProductImage(ctx, p.id, `${prefix}c.png`);
    const order = async () =>
      (await getProductForEdit(ctx, p.id)).images.map((i) => i.id);
    await moveProductImage(ctx, p.id, third.id, "first");
    expect(await order()).toEqual([third.id, first.id, second.id]);
    await moveProductImage(ctx, p.id, second.id, "up");
    expect(await order()).toEqual([third.id, second.id, first.id]);
    await moveProductImage(ctx, p.id, third.id, "down");
    expect(await order()).toEqual([second.id, third.id, first.id]);
    await setProductImageAlt(ctx, p.id, second.id, "  T-shirt plié  ");
    expect(
      (await db.productImage.findUniqueOrThrow({ where: { id: second.id } }))
        .alt,
    ).toBe("T-shirt plié");
    await setProductImageAlt(ctx, p.id, second.id, " ");
    expect(
      (await db.productImage.findUniqueOrThrow({ where: { id: second.id } }))
        .alt,
    ).toBeNull();
    expect((await listProducts(ctx))[0]!.imageUrl).toBe(`${prefix}b.png`);
    await removeProductImage(ctx, p.id, first.id);
    expect(await order()).toEqual([second.id, third.id]);
    await expect(removeProductImage(ctx, p.id, first.id)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    for (let i = 0; i < 8; i++)
      await addProductImage(ctx, p.id, `${prefix}x${i}.png`);
    await expect(
      addProductImage(ctx, p.id, `${prefix}de-trop.png`),
    ).rejects.toMatchObject({ code: "SHOP_TOO_MANY_IMAGES" });
    // la suppression du produit retire ses photos
    await deleteProduct(ctx, p.id);
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(0);
  });

  it("chaque organisation ne voit et ne modifie que son catalogue", async () => {
    const a = await setup();
    const b = await setup();
    const p = await createProduct(a, tshirt);
    await expect(getProductForEdit(b, p.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(updateProduct(b, p.id, tshirt)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      saveProductOptions(b, p.id, [
        { name: "Taille", values: [{ name: "S" }] },
      ]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listProducts(b)).toEqual([]);
  });
});

describe("boutique : retrait et livraison (US-SHOP-03)", () => {
  it("lieux de retrait : ajout, modification, mise de côté, suppression ; contrôlés ; propres à l'organisation", async () => {
    const ctx = await setup();
    const other = await setup();
    const point = await createPickupPoint(ctx, {
      name: "  Accueil   du théâtre ",
      address: "Rue Haute 1\n1000 Bruxelles",
      instructions: " Du mardi au samedi ",
    });
    expect(point).toMatchObject({
      name: "Accueil du théâtre",
      instructions: "Du mardi au samedi",
      active: true,
      sortOrder: 0,
    });
    await expect(
      createPickupPoint(ctx, { name: "Bar", address: " " }),
    ).rejects.toMatchObject({ code: "SHOP_PICKUP_INVALID" });
    await updatePickupPoint(ctx, point.id, {
      name: "Billetterie",
      address: "Rue Haute 1",
      instructions: "",
    });
    await setPickupPointActive(ctx, point.id, false);
    expect(await listPickupPoints(ctx)).toMatchObject([
      { name: "Billetterie", instructions: null, active: false },
    ]);
    await expect(
      updatePickupPoint(other, point.id, { name: "X", address: "Y" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await deletePickupPoint(ctx, point.id);
    expect(await listPickupPoints(ctx)).toEqual([]);
  });

  it("modes de livraison : prix fixe (0 : offerte), contrôlés, propres à l'organisation", async () => {
    const ctx = await setup();
    const other = await setup();
    const colis = await createShippingMethod(ctx, {
      name: "Colis suivi",
      price: "4,90",
    });
    const offert = await createShippingMethod(ctx, {
      name: "Lettre",
      price: "0",
    });
    expect([colis.priceMinor, offert.priceMinor, offert.sortOrder]).toEqual([
      490, 0, 1,
    ]);
    await expect(
      createShippingMethod(ctx, { name: "Colis", price: "abc" }),
    ).rejects.toMatchObject({ code: "SHOP_AMOUNT_INVALID" });
    await expect(
      createShippingMethod(ctx, { name: " ", price: "3" }),
    ).rejects.toMatchObject({ code: "SHOP_SHIPPING_INVALID" });
    await updateShippingMethod(ctx, colis.id, {
      name: "Colis 48 h",
      price: "6",
    });
    await setShippingMethodActive(ctx, offert.id, false);
    await setShippingMethodActive(ctx, offert.id, true);
    expect(
      (await listShippingMethods(ctx)).map((m) => [
        m.name,
        m.priceMinor,
        m.active,
      ]),
    ).toEqual([
      ["Colis 48 h", 600, true],
      ["Lettre", 0, true],
    ]);
    await expect(deleteShippingMethod(other, colis.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await deleteShippingMethod(ctx, colis.id);
    expect(await listShippingMethods(ctx)).toHaveLength(1);
  });
});
