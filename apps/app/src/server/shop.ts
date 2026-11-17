import "server-only";
import {
  cleanNames,
  combinationCount,
  combinations,
  CoreError,
  hasFeature,
  MIN_PAID_PRICE,
  parseMajorToMinor,
  parseVatRate,
  productSaleBlocker,
  SHOP_LIMITS,
  slugify,
  VAT_RATES_BPS,
  type ProductStatusValue,
} from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { exponentFor } from "./events";
import { deletePublicFile, publicFileUrl } from "./storage";

/**
 * Boutique (lot 3, Pro), section 9.35 du CDC : catalogue de l'organisation. Produits hors événement (nom, description,
 * photos, prix TTC, taux de TVA propre, statut, mise en avant, modes de remise acceptés), options libres et variantes
 * (une par combinaison, avec son stock et son supplément de prix). Aucune commission Evoly sur les produits.
 */

/** RG-SHOP-01 : la boutique est une fonctionnalité Pro. */
export function requireShop(ctx: OrgContext) {
  if (!hasFeature(ctx.features, "SHOP")) throw new CoreError("PRO_REQUIRED");
}

export interface ProductInput {
  name: string;
  description?: string | null;
  /** prix TTC saisi : « 25 », « 24,50 » */
  price: string;
  /** taux de TVA saisi en pour cent : « 21 », « 5,5 » */
  vatRate: string;
  pickupEnabled?: boolean;
  shippingEnabled?: boolean;
  featured?: boolean;
}

/** Taux de TVA proposé pour un nouveau produit : le taux normal du pays de l'organisation. */
export function defaultVatRateBps(country: string): number {
  return VAT_RATES_BPS[country.toUpperCase()] ?? 0;
}

function parseProduct(input: ProductInput, currency: string) {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) throw new CoreError("SHOP_NAME_REQUIRED");
  const priceMinor = parseMajorToMinor(input.price, exponentFor(currency));
  // RG-SHOP-02 : un produit se paie (1 au moins dans la devise, comme un billet payant)
  if (priceMinor == null || priceMinor < (MIN_PAID_PRICE[currency] ?? 100))
    throw new CoreError("SHOP_PRICE_INVALID");
  const vatRateBps = parseVatRate(input.vatRate);
  if (vatRateBps == null) throw new CoreError("SHOP_VAT_INVALID");
  return {
    name,
    description: input.description?.trim().slice(0, 2000) || null,
    priceMinor,
    vatRateBps,
    pickupEnabled: input.pickupEnabled ?? true,
    shippingEnabled: input.shippingEnabled ?? false,
    featured: input.featured ?? false,
  };
}

/** Stock saisi : vide, illimité (null) ; sinon un entier positif ou nul. */
function parseStock(input: string | null | undefined): number | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000)
    throw new CoreError("SHOP_STOCK_INVALID");
  return n;
}

async function ownProduct(ctx: OrgContext, productId: string) {
  const product = await db.product.findFirst({
    where: { id: productId, organizationId: ctx.organization.id },
  });
  if (!product) throw new CoreError("NOT_FOUND");
  return product;
}

async function uniqueSlug(organizationId: string, name: string) {
  const base = slugify(name, 60) || "produit";
  // chemins réservés de la boutique publique : le panier et les commandes
  const taken = new Set([
    "panier",
    "commande",
    ...(
      await db.product.findMany({
        where: { organizationId, slug: { startsWith: base } },
        select: { slug: true },
      })
    ).map((p) => p.slug),
  ]);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

function log(
  ctx: OrgContext,
  action: string,
  productId: string,
  metadata?: Record<string, string | number | boolean>,
) {
  return audit({
    action,
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Product",
    targetId: productId,
    ...(metadata ? { metadata } : {}),
  });
}

/** US-SHOP-01 : nouveau produit, en brouillon, avec sa variante unique (stock saisi, vide : illimité). */
export async function createProduct(
  ctx: OrgContext,
  input: ProductInput & { stock?: string | null },
) {
  requireShop(ctx);
  const currency = ctx.organization.currency;
  const data = parseProduct(input, currency);
  const stock = parseStock(input.stock);
  const organizationId = ctx.organization.id;
  const product = await db.product.create({
    data: {
      organizationId,
      ...data,
      currency,
      slug: await uniqueSlug(organizationId, data.name),
      sortOrder: await db.product.count({ where: { organizationId } }),
      variants: { create: { key: "", label: "", stock } },
    },
  });
  await log(ctx, "shop.product_created", product.id);
  return product;
}

export async function updateProduct(
  ctx: OrgContext,
  productId: string,
  input: ProductInput,
) {
  requireShop(ctx);
  const product = await ownProduct(ctx, productId);
  const data = parseProduct(input, product.currency);
  if (product.status === "ON_SALE") await saleCheck(ctx, product.id, data);
  await db.product.update({ where: { id: product.id }, data });
  await log(ctx, "shop.product_updated", product.id);
}

/**
 * RG-SHOP-05 : mise en vente seulement avec une variante active et un mode de remise réellement proposé (retrait avec
 * au moins un point de retrait actif, ou livraison avec au moins un mode de livraison actif).
 */
async function saleCheck(
  ctx: OrgContext,
  productId: string,
  modes: { pickupEnabled: boolean; shippingEnabled: boolean },
) {
  const organizationId = ctx.organization.id;
  const [activeVariants, points, methods] = await Promise.all([
    db.productVariant.count({ where: { productId, active: true } }),
    db.pickupPoint.count({ where: { organizationId, active: true } }),
    db.shippingMethod.count({ where: { organizationId, active: true } }),
  ]);
  const blocker = productSaleBlocker({ activeVariants, ...modes });
  if (blocker === "NO_VARIANT") throw new CoreError("SHOP_NO_VARIANT");
  if (blocker === "NO_FULFILLMENT") throw new CoreError("SHOP_NO_FULFILLMENT");
  const pickup = modes.pickupEnabled && points > 0;
  const shipping = modes.shippingEnabled && methods > 0;
  if (!pickup && !shipping)
    throw new CoreError(
      modes.pickupEnabled ? "SHOP_NO_PICKUP_POINT" : "SHOP_NO_SHIPPING_METHOD",
    );
}

/** Brouillon, en vente ou archivé (un produit archivé n'est plus en vente, ses commandes restent). */
export async function setProductStatus(
  ctx: OrgContext,
  productId: string,
  status: ProductStatusValue,
) {
  requireShop(ctx);
  const product = await ownProduct(ctx, productId);
  if (status === "ON_SALE") await saleCheck(ctx, product.id, product);
  await db.product.update({ where: { id: product.id }, data: { status } });
  await log(ctx, "shop.product_status", product.id, { status });
}

/** Mettre en avant dans la boutique, ou non. */
export async function setProductFeatured(
  ctx: OrgContext,
  productId: string,
  featured: boolean,
) {
  requireShop(ctx);
  const product = await ownProduct(ctx, productId);
  await db.product.update({ where: { id: product.id }, data: { featured } });
  await log(ctx, "shop.product_featured", product.id, { featured });
}

/** Suppression d'un produit jamais vendu (photos comprises) ; sinon, il s'archive (RG-SHOP-06). */
export async function deleteProduct(ctx: OrgContext, productId: string) {
  requireShop(ctx);
  const product = await ownProduct(ctx, productId);
  const used = await db.productVariant.count({
    where: {
      productId: product.id,
      OR: [{ sold: { gt: 0 } }, { held: { gt: 0 } }],
    },
  });
  if (used > 0) throw new CoreError("SHOP_PRODUCT_SOLD");
  const images = await db.productImage.findMany({
    where: { productId: product.id },
    select: { url: true },
  });
  await db.product.delete({ where: { id: product.id } });
  await Promise.all(images.map((i) => deletePublicFile(i.url)));
  await log(ctx, "shop.product_deleted", product.id);
}

export interface OptionGroupDraft {
  /** identifiant d'une option existante ; absent : nouvelle option */
  id?: string;
  name: string;
  values: Array<{ id?: string; name: string }>;
}

/**
 * US-SHOP-02, RG-SHOP-03 : options libres d'un produit et leurs valeurs (3 options, 20 valeurs chacune, 100 combinaisons
 * au plus). Les variantes suivent : une par combinaison ; une combinaison qui existait garde son stock et son supplément ;
 * une combinaison disparue est supprimée, ou mise de côté (inactive) si elle a déjà été vendue ou réservée.
 */
export async function saveProductOptions(
  ctx: OrgContext,
  productId: string,
  drafts: OptionGroupDraft[],
) {
  requireShop(ctx);
  const product = await ownProduct(ctx, productId);
  const groupNames = cleanNames(drafts.map((g) => g.name));
  if (groupNames.duplicate) throw new CoreError("SHOP_OPTION_DUPLICATE");
  const named = drafts.map((g) => ({
    ...g,
    name: g.name.replace(/\s+/g, " ").trim().slice(0, 40),
  }));
  // une option sans nom mais avec des valeurs : refusée ; entièrement vide : ignorée
  if (named.some((g) => !g.name && g.values.some((v) => v.name.trim())))
    throw new CoreError("SHOP_OPTION_NAME_REQUIRED");
  const groups = named.filter((g) => g.name);
  if (groups.length > SHOP_LIMITS.groups)
    throw new CoreError("SHOP_TOO_MANY_OPTIONS");
  for (const g of groups) {
    const values = cleanNames(g.values.map((v) => v.name));
    if (values.duplicate) throw new CoreError("SHOP_OPTION_DUPLICATE");
    if (values.names.length === 0)
      throw new CoreError("SHOP_OPTION_VALUES_REQUIRED");
    if (values.names.length > SHOP_LIMITS.values)
      throw new CoreError("SHOP_TOO_MANY_VALUES");
  }
  if (
    combinationCount(
      groups.map((g) => g.values.filter((v) => v.name.trim()).length),
    ) > SHOP_LIMITS.variants
  )
    throw new CoreError("SHOP_TOO_MANY_VARIANTS");

  await db.$transaction(async (tx) => {
    const existing = await tx.productOptionGroup.findMany({
      where: { productId: product.id },
      include: { values: true },
    });
    const keptGroups = new Set(
      groups.map((g) => g.id).filter((id): id is string => !!id),
    );
    await tx.productOptionGroup.deleteMany({
      where: { productId: product.id, id: { notIn: [...keptGroups] } },
    });
    // noms provisoires d'abord : deux options (ou valeurs) qui échangent leurs noms ne se heurtent pas à l'unicité
    for (const g of existing.filter((e) => keptGroups.has(e.id))) {
      await tx.productOptionGroup.update({
        where: { id: g.id },
        data: { name: `\u001f${g.id}` },
      });
      for (const v of g.values)
        await tx.productOptionValue.update({
          where: { id: v.id },
          data: { name: `\u001f${v.id}` },
        });
    }
    for (const [gi, g] of groups.entries()) {
      const known = existing.find((e) => e.id === g.id);
      const group = known
        ? await tx.productOptionGroup.update({
            where: { id: known.id },
            data: { name: g.name, sortOrder: gi },
          })
        : await tx.productOptionGroup.create({
            data: { productId: product.id, name: g.name, sortOrder: gi },
          });
      const values = g.values
        .map((v) => ({
          ...v,
          name: v.name.replace(/\s+/g, " ").trim().slice(0, 40),
        }))
        .filter((v) => v.name);
      const keptValues = new Set(
        values
          .map((v) => v.id)
          .filter(
            (id): id is string =>
              !!id && !!known?.values.some((kv) => kv.id === id),
          ),
      );
      if (known)
        await tx.productOptionValue.deleteMany({
          where: { groupId: group.id, id: { notIn: [...keptValues] } },
        });
      for (const [vi, v] of values.entries()) {
        if (v.id && keptValues.has(v.id))
          await tx.productOptionValue.update({
            where: { id: v.id },
            data: { name: v.name, sortOrder: vi },
          });
        else
          await tx.productOptionValue.create({
            data: { groupId: group.id, name: v.name, sortOrder: vi },
          });
      }
    }
    await syncVariants(tx, product.id);
  });
  await log(ctx, "shop.options_updated", product.id, {
    options: groups.length,
  });
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Variantes alignées sur les combinaisons des options enregistrées (voir saveProductOptions). */
async function syncVariants(tx: Tx, productId: string) {
  const groups = await tx.productOptionGroup.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    include: { values: { orderBy: { sortOrder: "asc" } } },
  });
  const combos = combinations(groups);
  const variants = await tx.productVariant.findMany({ where: { productId } });
  const byKey = new Map(variants.map((v) => [v.key, v]));
  for (const [i, c] of combos.entries()) {
    const known = byKey.get(c.key);
    if (known)
      await tx.productVariant.update({
        where: { id: known.id },
        data: { label: c.label, sortOrder: i, active: true },
      });
    else
      await tx.productVariant.create({
        data: { productId, key: c.key, label: c.label, sortOrder: i },
      });
  }
  const keys = new Set(combos.map((c) => c.key));
  for (const v of variants.filter((v) => !keys.has(v.key))) {
    if (v.sold > 0 || v.held > 0)
      await tx.productVariant.update({
        where: { id: v.id },
        data: { active: false },
      });
    else await tx.productVariant.delete({ where: { id: v.id } });
  }
}

export interface VariantDraft {
  id: string;
  /** supplément saisi (« 2 », « 2,50 ») ; vide : aucun */
  priceDelta?: string | null;
  /** stock saisi ; vide : illimité */
  stock?: string | null;
  active: boolean;
}

/**
 * US-SHOP-02, RG-SHOP-04 : stock et supplément de chaque variante. Le stock ne descend jamais sous les paniers en cours
 * de paiement ; un produit en vente garde au moins une variante active.
 */
export async function saveVariants(
  ctx: OrgContext,
  productId: string,
  drafts: VariantDraft[],
) {
  requireShop(ctx);
  const product = await ownProduct(ctx, productId);
  const exponent = exponentFor(product.currency);
  const rows = drafts.map((d) => {
    const delta = (d.priceDelta ?? "").trim();
    const priceDeltaMinor = delta ? parseMajorToMinor(delta, exponent) : 0;
    if (priceDeltaMinor == null) throw new CoreError("SHOP_AMOUNT_INVALID");
    return {
      id: d.id,
      priceDeltaMinor,
      stock: parseStock(d.stock),
      active: d.active,
    };
  });
  const variants = await db.productVariant.findMany({
    where: { productId: product.id },
  });
  const known = new Map(variants.map((v) => [v.id, v]));
  if (rows.some((r) => !known.has(r.id))) throw new CoreError("NOT_FOUND");
  const activeAfter = variants.filter((v) => {
    const r = rows.find((x) => x.id === v.id);
    return r ? r.active : v.active;
  }).length;
  if (product.status === "ON_SALE" && activeAfter === 0)
    throw new CoreError("SHOP_NO_VARIANT");
  await db.$transaction(async (tx) => {
    for (const r of rows) {
      // jamais sous les paniers en cours, même s'ils changent pendant l'enregistrement (contrainte de la base)
      const res = await tx.productVariant.updateMany({
        where: {
          id: r.id,
          productId: product.id,
          ...(r.stock != null ? { held: { lte: r.stock } } : {}),
        },
        data: {
          priceDeltaMinor: r.priceDeltaMinor,
          stock: r.stock,
          active: r.active,
        },
      });
      if (res.count === 0) throw new CoreError("SHOP_STOCK_BELOW_HELD");
    }
  });
  await log(ctx, "shop.variants_updated", product.id);
}

/** Adresses acceptées pour une photo : celles du dossier de l'organisation, déposées par l'import (jamais une adresse externe). */
function productImagePrefix(organizationId: string) {
  return publicFileUrl(`orgs/${organizationId}/products/`);
}

/** US-SHOP-01 : photo ajoutée à la galerie (10 au plus), après son import. */
export async function addProductImage(
  ctx: OrgContext,
  productId: string,
  url: string,
) {
  requireShop(ctx);
  const product = await ownProduct(ctx, productId);
  if (!url.startsWith(productImagePrefix(ctx.organization.id)))
    throw new CoreError("UPLOAD_INVALID");
  const count = await db.productImage.count({
    where: { productId: product.id },
  });
  if (count >= SHOP_LIMITS.images) throw new CoreError("SHOP_TOO_MANY_IMAGES");
  const last = await db.productImage.findFirst({
    where: { productId: product.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const image = await db.productImage.create({
    data: {
      productId: product.id,
      url,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  await log(ctx, "shop.image_added", product.id);
  return image;
}

async function ownImage(ctx: OrgContext, productId: string, imageId: string) {
  const product = await ownProduct(ctx, productId);
  const image = await db.productImage.findFirst({
    where: { id: imageId, productId: product.id },
  });
  if (!image) throw new CoreError("NOT_FOUND");
  return image;
}

export async function removeProductImage(
  ctx: OrgContext,
  productId: string,
  imageId: string,
) {
  requireShop(ctx);
  const image = await ownImage(ctx, productId, imageId);
  await db.productImage.delete({ where: { id: image.id } });
  await deletePublicFile(image.url);
  await log(ctx, "shop.image_removed", productId);
}

/** Photo principale (la première de la galerie), ou une place plus tôt ou plus tard. */
export async function moveProductImage(
  ctx: OrgContext,
  productId: string,
  imageId: string,
  to: "first" | "up" | "down",
) {
  requireShop(ctx);
  const image = await ownImage(ctx, productId, imageId);
  const all = await db.productImage.findMany({
    where: { productId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const ids = all.map((i) => i.id);
  const from = ids.indexOf(image.id);
  ids.splice(from, 1);
  const at =
    to === "first"
      ? 0
      : to === "up"
        ? Math.max(0, from - 1)
        : Math.min(ids.length, from + 1);
  ids.splice(at, 0, image.id);
  await db.$transaction(
    ids.map((id, i) =>
      db.productImage.update({ where: { id }, data: { sortOrder: i } }),
    ),
  );
}

/** Texte alternatif d'une photo (lecteurs d'écran) ; vide : le nom du produit. */
export async function setProductImageAlt(
  ctx: OrgContext,
  productId: string,
  imageId: string,
  alt: string,
) {
  requireShop(ctx);
  const image = await ownImage(ctx, productId, imageId);
  await db.productImage.update({
    where: { id: image.id },
    data: { alt: alt.trim().slice(0, 200) || null },
  });
}

export interface ProductRow {
  id: string;
  name: string;
  status: ProductStatusValue;
  featured: boolean;
  imageUrl: string | null;
  /** prix le plus bas et le plus haut des variantes actives (suppléments compris) */
  priceMinMinor: number;
  priceMaxMinor: number;
  currency: string;
  variants: number;
  /** unités disponibles des variantes actives ; null : au moins une sans limite */
  stock: number | null;
  sold: number;
  pickupEnabled: boolean;
  shippingEnabled: boolean;
}

/** Onglet Produits : le catalogue, photo principale, prix, stock et ventes. */
export async function listProducts(ctx: OrgContext): Promise<ProductRow[]> {
  requireShop(ctx);
  const products = await db.product.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
      variants: {
        select: {
          active: true,
          stock: true,
          held: true,
          sold: true,
          priceDeltaMinor: true,
        },
      },
    },
  });
  return products.map((p) => {
    const active = p.variants.filter((v) => v.active);
    const prices = (active.length ? active : p.variants).map(
      (v) => p.priceMinor + v.priceDeltaMinor,
    );
    const unlimited = active.some((v) => v.stock == null);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      featured: p.featured,
      imageUrl: p.images[0]?.url ?? null,
      priceMinMinor: prices.length ? Math.min(...prices) : p.priceMinor,
      priceMaxMinor: prices.length ? Math.max(...prices) : p.priceMinor,
      currency: p.currency,
      variants: active.length,
      stock: unlimited
        ? null
        : active.reduce((n, v) => n + Math.max(0, (v.stock ?? 0) - v.held), 0),
      sold: p.variants.reduce((n, v) => n + v.sold, 0),
      pickupEnabled: p.pickupEnabled,
      shippingEnabled: p.shippingEnabled,
    };
  });
}

/** Fiche d'un produit : informations, photos, options et variantes. */
export async function getProductForEdit(ctx: OrgContext, productId: string) {
  requireShop(ctx);
  const product = await db.product.findFirst({
    where: { id: productId, organizationId: ctx.organization.id },
    include: {
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { values: { orderBy: { sortOrder: "asc" } } },
      },
      variants: { orderBy: [{ active: "desc" }, { sortOrder: "asc" }] },
    },
  });
  if (!product) throw new CoreError("NOT_FOUND");
  return product;
}
