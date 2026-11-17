import { vatIncluded } from "./finance";
import type { Minor } from "./money";

/**
 * Boutique (lot 3, Pro) : règles pures du catalogue. Un produit a des options libres (« Taille », « Couleur ») ; chaque
 * combinaison de leurs valeurs est une variante, avec son stock et son supplément de prix. Sans option : une variante
 * unique, de clé vide.
 */

/** Nombre maximal d'options par produit, de valeurs par option, et de combinaisons (au-delà, l'écran serait illisible). */
export const SHOP_LIMITS = {
  groups: 3,
  values: 20,
  variants: 100,
  images: 10,
} as const;

export type ProductStatusValue = "DRAFT" | "ON_SALE" | "ARCHIVED";

/** Clé d'une combinaison : identifiants des valeurs triés, joints par « . » (l'ordre des options n'y change rien). */
export function variantKey(valueIds: readonly string[]): string {
  return [...valueIds].sort().join(".");
}

export interface OptionGroupInput {
  id: string;
  name: string;
  values: ReadonlyArray<{ id: string; name: string }>;
}

export interface Combination {
  key: string;
  valueIds: string[];
  /** « M · Noir », dans l'ordre des options */
  label: string;
}

/**
 * Toutes les combinaisons des valeurs, dans l'ordre des options puis des valeurs. Une option sans valeur est ignorée ;
 * aucune option : la variante unique (clé et libellé vides).
 */
export function combinations(
  groups: readonly OptionGroupInput[],
): Combination[] {
  const used = groups.filter((g) => g.values.length > 0);
  let out: Array<{ ids: string[]; names: string[] }> = [{ ids: [], names: [] }];
  for (const g of used)
    out = out.flatMap((c) =>
      g.values.map((v) => ({
        ids: [...c.ids, v.id],
        names: [...c.names, v.name],
      })),
    );
  return out.map((c) => ({
    key: variantKey(c.ids),
    valueIds: c.ids,
    label: c.names.join(" · "),
  }));
}

/** Nombre de combinaisons sans les construire (contrôle avant l'enregistrement des options). */
export function combinationCount(valuesPerGroup: readonly number[]): number {
  return valuesPerGroup.filter((n) => n > 0).reduce((total, n) => total * n, 1);
}

/** Noms d'options ou de valeurs : espaces superflus retirés, vides écartés, doublons (casse ignorée) refusés. */
export function cleanNames(
  names: readonly string[],
  max = 40,
): { names: string[]; duplicate: boolean } {
  const out: string[] = [];
  const seen = new Set<string>();
  let duplicate = false;
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, max);
    if (!name) continue;
    const k = name.toLocaleLowerCase("fr");
    if (seen.has(k)) duplicate = true;
    else {
      seen.add(k);
      out.push(name);
    }
  }
  return { names: out, duplicate };
}

/** Taux de TVA maximal accepté (30 %) : le plus haut taux normal de l'Union est de 27 %. */
export const MAX_VAT_BPS = 3000;

/**
 * Taux de TVA saisi en pour cent (« 21 », « 5,5 », « 5.5 % ») vers des points de base (2100, 550). Deux décimales au
 * plus, entre 0 et 30 % ; sinon null.
 */
export function parseVatRate(input: string): number | null {
  const s = input.trim().replace(/\s*%$/, "").replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return null;
  const bps = Math.round(Number(s) * 100);
  return bps <= MAX_VAT_BPS ? bps : null;
}

/** Taux de TVA affiché sur un reçu, dans la langue de l'acheteur : 2100 → « 21 », 550 → « 5,5 » (« 5.5 » en anglais). */
export function formatVatRate(bps: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    bps / 100,
  );
}

/** Points de base vers la saisie : 2100 → « 21 », 550 → « 5,5 ». */
export function vatRateInput(bps: number): string {
  return String(bps / 100).replace(".", ",");
}

/** Prix d'une variante : prix du produit plus son supplément. */
export function variantPrice(
  productPriceMinor: Minor,
  deltaMinor: Minor,
): Minor {
  return productPriceMinor + deltaMinor;
}

/** Unités encore disponibles à la vente : stock moins les paniers en cours ; illimité : null. */
export function variantAvailable(v: {
  stock: number | null;
  held: number;
}): number | null {
  return v.stock == null ? null : Math.max(0, v.stock - v.held);
}

/**
 * Un produit se met en vente seulement avec au moins une variante active et un mode de remise accepté (retrait ou
 * livraison) : sinon la raison du refus.
 */
export function productSaleBlocker(p: {
  activeVariants: number;
  pickupEnabled: boolean;
  shippingEnabled: boolean;
}): "NO_VARIANT" | "NO_FULFILLMENT" | null {
  if (p.activeVariants === 0) return "NO_VARIANT";
  if (!p.pickupEnabled && !p.shippingEnabled) return "NO_FULFILLMENT";
  return null;
}

/** Panier de la boutique : 30 lignes au plus, 20 unités d'une même variante. */
export const SHOP_CART_LIMITS = { lines: 30, quantity: 20 } as const;

export interface ShopTotalsLine {
  unitPriceMinor: Minor;
  quantity: number;
  vatRateBps: number;
}

export interface ShopTotals {
  subtotalMinor: Minor;
  shippingMinor: Minor;
  totalMinor: Minor;
  /** TVA comprise, tous taux confondus */
  vatMinor: Minor;
  /** par taux (du plus haut au plus bas) : montant toutes taxes comprises et TVA comprise ; taux nul omis */
  vat: Array<{ rateBps: number; amountMinor: Minor; vatMinor: Minor }>;
}

/**
 * RG-SHOP-10 : totaux d'une commande de la boutique, toutes taxes comprises, et TVA comprise de chaque taux pour le
 * reçu (calculée sur la somme du taux, arrondie au centime). La livraison suit son propre taux.
 */
export function shopOrderTotals(
  lines: readonly ShopTotalsLine[],
  shipping: { amountMinor: Minor; vatRateBps: number } | null = null,
): ShopTotals {
  const byRate = new Map<number, Minor>();
  const add = (rate: number, amount: Minor) =>
    byRate.set(rate, (byRate.get(rate) ?? 0) + amount);
  let subtotalMinor = 0;
  for (const l of lines) {
    const amount = l.unitPriceMinor * l.quantity;
    subtotalMinor += amount;
    add(l.vatRateBps, amount);
  }
  const shippingMinor = shipping?.amountMinor ?? 0;
  if (shipping && shippingMinor > 0) add(shipping.vatRateBps, shippingMinor);
  const vat = [...byRate]
    .filter(([rate, amount]) => rate > 0 && amount > 0)
    .sort(([a], [b]) => b - a)
    .map(([rateBps, amountMinor]) => ({
      rateBps,
      amountMinor,
      vatMinor: vatIncluded(amountMinor, rateBps),
    }));
  return {
    subtotalMinor,
    shippingMinor,
    totalMinor: subtotalMinor + shippingMinor,
    vatMinor: vat.reduce((n, v) => n + v.vatMinor, 0),
    vat,
  };
}

/** Délai de rétractation d'un achat à distance (RG-SHOP-11) : 14 jours après la réception. */
export const WITHDRAWAL_DAYS = 14;

/**
 * RG-SHOP-11 : rétractation possible sur une commande payée, pas entièrement remboursée, tant que les produits ne sont
 * pas reçus et jusqu'à 14 jours après leur réception (retrait en main propre ou livraison).
 */
export function withdrawalOpen(
  o: {
    status: string;
    totalMinor: Minor;
    refundedMinor: Minor;
    receivedAt: Date | null;
  },
  now: Date,
): boolean {
  if (o.status !== "PAID" && o.status !== "PARTIALLY_REFUNDED") return false;
  if (o.refundedMinor >= o.totalMinor) return false;
  if (!o.receivedAt) return true;
  return now.getTime() < o.receivedAt.getTime() + WITHDRAWAL_DAYS * 86_400_000;
}

/** Code de retrait saisi à la main : majuscules, sans espaces ni tirets. */
export function normalizePickupCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Nom d'une option achetée : « T-shirt de la tournée (M) » pour un produit de la boutique, sinon son nom. */
export function optionLineName(
  name: string,
  variantLabel: string | null | undefined,
): string {
  return variantLabel ? `${name} (${variantLabel})` : name;
}
