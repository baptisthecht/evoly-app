import "server-only";
import { variantAvailable } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { shopOpenFor } from "./shopCheckout";

/**
 * Boutique publique (lot 3b), section 9.35 du CDC : les produits en vente d'une organisation (Pro), pour la page de
 * l'organisation, la boutique et la page de chaque produit. Un produit sans variante disponible s'affiche épuisé.
 */

export interface PublicProductCard {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  imageAlt: string | null;
  priceMinMinor: number;
  priceMaxMinor: number;
  currency: string;
  featured: boolean;
  soldOut: boolean;
}

/** Produits en vente, mis en avant d'abord ; null : pas de boutique (offre gratuite, organisation suspendue). */
export async function publicShopProducts(
  organizationId: string,
): Promise<PublicProductCard[] | null> {
  if (!(await shopOpenFor(organizationId))) return null;
  const products = await db.product.findMany({
    where: { organizationId, status: "ON_SALE" },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      images: {
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { url: true, alt: true },
      },
      variants: {
        where: { active: true },
        select: { stock: true, held: true, priceDeltaMinor: true },
      },
    },
  });
  return products
    .filter((p) => p.variants.length > 0)
    .map((p) => {
      const prices = p.variants.map((v) => p.priceMinor + v.priceDeltaMinor);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        imageUrl: p.images[0]?.url ?? null,
        imageAlt: p.images[0]?.alt ?? null,
        priceMinMinor: Math.min(...prices),
        priceMaxMinor: Math.max(...prices),
        currency: p.currency,
        featured: p.featured,
        soldOut: p.variants.every((v) => variantAvailable(v) === 0),
      };
    });
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: string;
  images: Array<{ url: string; alt: string | null }>;
  options: Array<{
    id: string;
    name: string;
    values: Array<{ id: string; name: string }>;
  }>;
  variants: Array<{
    id: string;
    key: string;
    label: string;
    priceMinor: number;
    /** unités disponibles ; null : sans limite */
    available: number | null;
  }>;
  pickupEnabled: boolean;
  /** livraison possible : le produit l'accepte et l'organisation a un mode de livraison actif (RG-SHOP-14) */
  shippingEnabled: boolean;
  /** lieux de retrait proposés (nom seulement) */
  pickupPoints: string[];
}

/** Page d'un produit en vente : photos, options, variantes actives avec leur prix et leur disponibilité. */
export async function publicShopProduct(
  organizationId: string,
  slug: string,
): Promise<PublicProduct | null> {
  if (!(await shopOpenFor(organizationId))) return null;
  const p = await db.product.findFirst({
    where: { organizationId, slug: slug.slice(0, 80), status: "ON_SALE" },
    include: {
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { values: { orderBy: { sortOrder: "asc" } } },
      },
      variants: { where: { active: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!p || p.variants.length === 0) return null;
  const points = p.pickupEnabled
    ? await db.pickupPoint.findMany({
        where: { organizationId, active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { name: true },
      })
    : [];
  const methods = p.shippingEnabled
    ? await db.shippingMethod.count({ where: { organizationId, active: true } })
    : 0;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    currency: p.currency,
    images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
    options: p.optionGroups
      .filter((g) => g.values.length > 0)
      .map((g) => ({
        id: g.id,
        name: g.name,
        values: g.values.map((v) => ({ id: v.id, name: v.name })),
      })),
    variants: p.variants.map((v) => ({
      id: v.id,
      key: v.key,
      label: v.label,
      priceMinor: p.priceMinor + v.priceDeltaMinor,
      available: variantAvailable(v),
    })),
    pickupEnabled: p.pickupEnabled,
    shippingEnabled: methods > 0,
    pickupPoints: points.map((x) => x.name),
  };
}

/** Cartes de la grille des produits : prix mis en forme (« 25 € », « à partir de 25 € »). */
export function productGridItems(
  products: PublicProductCard[],
  locale: Locale,
  from: (price: string) => string,
) {
  const money = (v: number, currency: string) =>
    formatMoney(v, currency, locale, { trimZeroCents: true });
  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt,
    price:
      p.priceMinMinor === p.priceMaxMinor
        ? money(p.priceMinMinor, p.currency)
        : from(money(p.priceMinMinor, p.currency)),
    soldOut: p.soldOut,
  }));
}
