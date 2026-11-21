import "server-only";
import { createHmac } from "node:crypto";
import {
  buyerEmailKey,
  CoreError,
  effectivePlan,
  hasFeature,
  humanCode,
  sha256Hex,
  shippingVatRate,
  shopOrderTotals,
  SHOP_CART_LIMITS,
  variantAvailable,
} from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  fromMollieAmount,
  mollieApi,
  MollieError,
  mollieLocale,
  toMollieAmount,
  type MollieAmount,
  type MollieApi,
  type MollieList,
  type MolliePayment,
  type MollieRefund,
} from "@/lib/mollie";
import { safeError } from "@/lib/redact";
import { audit } from "./audit";
import { BUYER_BLOCKED, isBlocked, isCardBlocked } from "./blockedBuyers";
import { mollieAccessToken, mollieForOrganization } from "./mollieAccounts";
import {
  MOLLIE_HOLD_MS,
  mollieWebhookUrl,
  paymentAccountFor,
  refundStatusFromMollie,
} from "./molliePayments";
import { getPlans } from "./plans";
import { PLAN_SUBSCRIPTION_SELECT } from "./planSelect";

/**
 * Boutique publique (lot 3b), section 9.35 du CDC : panier, réservation atomique des produits, coordonnées et lieu de
 * retrait, paiement sur le compte Mollie de l'organisation sans commission Evoly (page de paiement de Mollie),
 * validation unique du paiement, réservations expirées libérées. Les commandes de la boutique sont séparées des commandes de billets.
 */

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

/** Durée de la réservation des produits pendant le paiement. */
export const SHOP_HOLD_MINUTES = 15;
/** Version des conditions de vente acceptées (section « Produits de la boutique » ajoutée le 17 novembre 2026). */
export const SHOP_TERMS_VERSION = "2026-11";

/** Lien magique d'une commande de la boutique, dérivé d'un secret serveur (comme celui des billets, RG-POST-01). */
export function shopOrderToken(orderId: string, version: number): string {
  const e = env();
  return createHmac("sha256", e.ORDER_TOKEN_SECRET ?? e.BETTER_AUTH_SECRET)
    .update(`evoly-shop-order:${orderId}:${version}`)
    .digest("base64url");
}

export async function findShopOrderIdByToken(
  token: string,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const order = await db.shopOrder.findUnique({
    where: { accessTokenHash: await sha256Hex(token) },
    select: { id: true },
  });
  return order?.id ?? null;
}

/** RG-SHOP-01 : la boutique publique d'une organisation n'existe qu'en offre Pro (ou Partenaire). */
export async function shopOpenFor(organizationId: string): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      status: true,
      deletedAt: true,
      subscription: { select: PLAN_SUBSCRIPTION_SELECT },
    },
  });
  if (!org || org.status !== "ACTIVE" || org.deletedAt) return false;
  const plan = effectivePlan(org.subscription, new Date());
  return hasFeature((await getPlans())[plan].features, "SHOP");
}

export interface CartLine {
  variantId: string;
  quantity: number;
}

/** Panier nettoyé : quantités entières de 1 à 20, lignes d'une même variante réunies, 30 lignes au plus. */
export function cleanCart(lines: readonly CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const l of lines) {
    if (
      typeof l?.variantId !== "string" ||
      !/^[a-z0-9]{10,40}$/.test(l.variantId)
    )
      continue;
    const q = Math.floor(Number(l.quantity));
    if (!Number.isFinite(q) || q < 1) continue;
    merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + q);
  }
  return [...merged]
    .slice(0, SHOP_CART_LIMITS.lines)
    .map(([variantId, quantity]) => ({
      variantId,
      quantity: Math.min(quantity, SHOP_CART_LIMITS.quantity),
    }));
}

const variantSelect = {
  id: true,
  label: true,
  active: true,
  stock: true,
  held: true,
  priceDeltaMinor: true,
  product: {
    select: {
      id: true,
      organizationId: true,
      name: true,
      slug: true,
      status: true,
      priceMinor: true,
      currency: true,
      vatRateBps: true,
      pickupEnabled: true,
      shippingEnabled: true,
      images: {
        orderBy: { sortOrder: "asc" as const },
        take: 1,
        select: { url: true, alt: true },
      },
    },
  },
} as const;

export interface CartPreviewLine {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  imageUrl: string | null;
  unitPriceMinor: number;
  vatRateBps: number;
  quantity: number;
  /** unités encore disponibles ; null : sans limite */
  available: number | null;
  /** produit retiré de la vente, variante retirée ou épuisée : la ligne ne peut pas être commandée */
  problem: "UNAVAILABLE" | "NOT_ENOUGH" | null;
  pickupEnabled: boolean;
  shippingEnabled: boolean;
}

/** Panier du navigateur relu côté serveur : prix, disponibilité et modes de remise actuels (le panier ne fixe rien). */
export async function cartPreview(
  organizationId: string,
  raw: readonly CartLine[],
): Promise<CartPreviewLine[]> {
  const lines = cleanCart(raw);
  if (!lines.length) return [];
  const variants = await db.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    select: variantSelect,
  });
  return lines.flatMap((l) => {
    const v = variants.find((x) => x.id === l.variantId);
    if (!v || v.product.organizationId !== organizationId) return [];
    const available = variantAvailable(v);
    const sellable = v.active && v.product.status === "ON_SALE";
    return [
      {
        variantId: v.id,
        productId: v.product.id,
        productName: v.product.name,
        productSlug: v.product.slug,
        variantLabel: v.label,
        imageUrl: v.product.images[0]?.url ?? null,
        unitPriceMinor: v.product.priceMinor + v.priceDeltaMinor,
        vatRateBps: v.product.vatRateBps,
        quantity: l.quantity,
        available,
        problem:
          !sellable || available === 0
            ? "UNAVAILABLE"
            : available != null && available < l.quantity
              ? "NOT_ENOUGH"
              : null,
        pickupEnabled: v.product.pickupEnabled,
        shippingEnabled: v.product.shippingEnabled,
      },
    ];
  });
}

/** Libère les produits retenus par une réservation (expirée, annulée, acheteur bloqué). */
async function releaseLines(
  tx: Tx,
  lines: Array<{ variantId: string | null; quantity: number }>,
) {
  for (const l of lines)
    if (l.variantId)
      await tx.$executeRaw`UPDATE "ProductVariant" SET "held" = GREATEST("held" - ${l.quantity}, 0) WHERE id = ${l.variantId}`;
}

/**
 * RG-SHOP-07 : réservation atomique du panier. Chaque variante est retenue sans jamais dépasser son stock (même sous
 * forte concurrence) ; les prix, noms, options et taux de TVA sont figés sur la commande, valable 15 minutes.
 */
export async function reserveShopOrder(
  input: { organizationId: string; lines: readonly CartLine[]; locale: string },
  now = new Date(),
): Promise<{ token: string; reference: string; expiresAt: Date }> {
  if (!(await shopOpenFor(input.organizationId)))
    throw new CoreError("SHOP_UNAVAILABLE");
  const preview = await cartPreview(input.organizationId, input.lines);
  if (!preview.length) throw new CoreError("SHOP_CART_EMPTY");
  if (preview.some((l) => l.problem)) throw new CoreError("SHOP_OUT_OF_STOCK");
  // un mode de remise commun à tous les produits : retrait (3b) ou livraison (3d)
  if (
    !preview.every((l) => l.pickupEnabled) &&
    !preview.every((l) => l.shippingEnabled)
  )
    throw new CoreError("SHOP_MODES_CONFLICT");
  const org = await db.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { currency: true },
  });
  const totals = shopOrderTotals(preview);
  const expiresAt = new Date(now.getTime() + SHOP_HOLD_MINUTES * 60_000);
  const order = await db.$transaction(async (tx) => {
    for (const l of preview) {
      const taken = await tx.$executeRaw`
        UPDATE "ProductVariant" SET "held" = "held" + ${l.quantity}
        WHERE id = ${l.variantId} AND "active"
          AND ("stock" IS NULL OR "stock" - "held" >= ${l.quantity})`;
      if (taken !== 1) throw new CoreError("SHOP_OUT_OF_STOCK");
    }
    const created = await tx.shopOrder.create({
      data: {
        organizationId: input.organizationId,
        reference: `EVS-${humanCode(4)}-${humanCode(4)}`,
        pickupCode: humanCode(10),
        currency: org.currency,
        locale: input.locale.slice(0, 5),
        subtotalMinor: totals.subtotalMinor,
        totalMinor: totals.totalMinor,
        vatMinor: totals.vatMinor,
        holdExpiresAt: expiresAt,
        lines: {
          create: preview.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            productName: l.productName,
            variantLabel: l.variantLabel,
            imageUrl: l.imageUrl,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor,
            vatRateBps: l.vatRateBps,
          })),
        },
      },
      select: { id: true, reference: true, accessTokenVersion: true },
    });
    await tx.shopOrder.update({
      where: { id: created.id },
      data: {
        accessTokenHash: await sha256Hex(
          shopOrderToken(created.id, created.accessTokenVersion),
        ),
      },
    });
    return created;
  }, TX_OPTIONS);
  return {
    token: shopOrderToken(order.id, order.accessTokenVersion),
    reference: order.reference,
    expiresAt,
  };
}

/**
 * Annule une réservation encore en attente : produits libérés (acheteur bloqué, abandon). Un paiement déjà ouvert chez
 * Mollie ne s'annule pas toujours : payé malgré tout, il est remboursé en entier (syncShopPaymentFromMollie).
 */
export async function cancelShopReservation(token: string): Promise<void> {
  const id = await findShopOrderIdByToken(token);
  if (!id) return;
  await db.$transaction(async (tx) => {
    // verrou de la commande : un paiement validé au même instant passe d'abord, ou après l'annulation
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "ShopOrder" WHERE id = ${id} AND "status" = 'PENDING' FOR UPDATE`;
    if (!rows.length) return;
    const o = await tx.shopOrder.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    await releaseLines(tx, o.lines);
    await tx.shopOrder.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        holdExpiresAt: null,
      },
    });
  }, TX_OPTIONS);
}

/** Tâche planifiée (chaque minute) : réservations expirées de la boutique libérées. */
export async function releaseExpiredShopHolds(
  now = new Date(),
): Promise<number> {
  const expired = await db.shopOrder.findMany({
    where: { status: "PENDING", holdExpiresAt: { lt: now } },
    select: { id: true },
    take: 200,
  });
  let count = 0;
  for (const { id } of expired) {
    const released = await db.$transaction(async (tx) => {
      // verrou de la commande : un paiement validé au même instant passe d'abord, ou après la libération
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "ShopOrder" WHERE id = ${id} AND "status" = 'PENDING' AND "holdExpiresAt" < ${now} FOR UPDATE`;
      if (!rows.length) return false;
      const o = await tx.shopOrder.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });
      await releaseLines(tx, o.lines);
      await tx.shopOrder.update({
        where: { id },
        data: { status: "EXPIRED" },
      });
      return true;
    }, TX_OPTIONS);
    if (released) count += 1;
  }
  return count;
}

/** Commande en attente, pour la page de paiement : lignes, totaux, lieux de retrait proposés. */
export async function shopReservation(token: string, now = new Date()) {
  const id = await findShopOrderIdByToken(token);
  if (!id) return null;
  const order = await db.shopOrder.findUniqueOrThrow({
    where: { id },
    include: {
      lines: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { pickupEnabled: true, shippingEnabled: true } },
        },
      },
      refunds: { orderBy: { createdAt: "asc" } },
      organization: {
        select: { id: true, name: true, slug: true, country: true },
      },
    },
  });
  // modes de remise proposés : ceux que tous les produits de la commande acceptent (RG-SHOP-14)
  const pending = order.status === "PENDING";
  const pickup = order.lines.every((l) => l.product?.pickupEnabled ?? true);
  const shipping = order.lines.every((l) => l.product?.shippingEnabled);
  const points =
    pending && pickup
      ? await db.pickupPoint.findMany({
          where: { organizationId: order.organizationId, active: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, address: true, instructions: true },
        })
      : [];
  const shippingMethods =
    pending && shipping
      ? await db.shippingMethod.findMany({
          where: { organizationId: order.organizationId, active: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, priceMinor: true },
        })
      : [];
  return {
    order,
    points,
    shippingMethods,
    country: order.organization.country,
    expired:
      order.status === "PENDING" &&
      (!order.holdExpiresAt || order.holdExpiresAt <= now),
    // compte Mollie de l'organisation prêt à encaisser (RG-SHOP-08)
    payable: pending && !!(await paymentAccountFor(order.organizationId)),
  };
}

export interface ShopBuyerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  marketingOptIn?: boolean;
  /** retrait sur place (par défaut) ou livraison (RG-SHOP-14) */
  mode?: "PICKUP" | "SHIPPING";
  pickupPointId?: string;
  shippingMethodId?: string;
  address?: {
    name: string;
    line1: string;
    line2?: string;
    postalCode: string;
    city: string;
    country: string;
  };
}

type OrderForFulfillment = {
  organizationId: string;
  subtotalMinor: number;
  lines: Array<{
    vatRateBps: number;
    unitPriceMinor: number;
    quantity: number;
    product: { pickupEnabled: boolean; shippingEnabled: boolean } | null;
  }>;
};

/**
 * RG-SHOP-14 : mode de remise de la commande. Retrait : un lieu actif, tous les produits le permettent. Livraison : un
 * mode actif, tous les produits le permettent, une adresse complète ; ses frais s'ajoutent au total, avec la TVA du
 * taux le plus élevé des produits. Les champs de l'autre mode sont effacés.
 */
async function fulfillmentData(
  order: OrderForFulfillment,
  buyer: ShopBuyerInput,
) {
  if (buyer.mode === "SHIPPING") {
    const method = order.lines.every((l) => l.product?.shippingEnabled)
      ? await db.shippingMethod.findFirst({
          where: {
            id: buyer.shippingMethodId ?? "",
            organizationId: order.organizationId,
            active: true,
          },
        })
      : null;
    if (!method) throw new CoreError("SHOP_SHIPPING_REQUIRED");
    const a = buyer.address;
    const clean = (v: string | undefined, max: number) =>
      (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const address = {
      shipName: clean(a?.name, 100),
      shipAddress1: clean(a?.line1, 120),
      shipAddress2: clean(a?.line2, 120) || null,
      shipPostalCode: clean(a?.postalCode, 12),
      shipCity: clean(a?.city, 80),
      shipCountry: clean(a?.country, 2).toUpperCase(),
    };
    if (
      !address.shipName ||
      !address.shipAddress1 ||
      !address.shipPostalCode ||
      !address.shipCity ||
      !/^[A-Z]{2}$/.test(address.shipCountry)
    )
      throw new CoreError("SHOP_ADDRESS_REQUIRED");
    const vatRateBps = shippingVatRate(order.lines);
    const totals = shopOrderTotals(order.lines, {
      amountMinor: method.priceMinor,
      vatRateBps,
    });
    return {
      fulfillmentMode: "SHIPPING" as const,
      shippingMethodId: method.id,
      shippingName: method.name,
      shippingMinor: method.priceMinor,
      shippingVatBps: vatRateBps,
      totalMinor: totals.totalMinor,
      vatMinor: totals.vatMinor,
      ...address,
      pickupPointId: null,
      pickupName: null,
      pickupAddress: null,
      pickupInstructions: null,
    };
  }
  const point = order.lines.every((l) => l.product?.pickupEnabled ?? true)
    ? await db.pickupPoint.findFirst({
        where: {
          id: buyer.pickupPointId ?? "",
          organizationId: order.organizationId,
          active: true,
        },
      })
    : null;
  if (!point) throw new CoreError("SHOP_PICKUP_REQUIRED");
  return {
    fulfillmentMode: "PICKUP" as const,
    pickupPointId: point.id,
    pickupName: point.name,
    pickupAddress: point.address,
    pickupInstructions: point.instructions,
    shippingMethodId: null,
    shippingName: null,
    shippingMinor: 0,
    shippingVatBps: 0,
    totalMinor: order.subtotalMinor,
    vatMinor: shopOrderTotals(order.lines).vatMinor,
    shipName: null,
    shipAddress1: null,
    shipAddress2: null,
    shipPostalCode: null,
    shipCity: null,
    shipCountry: null,
  };
}

/** Après « Payer » : page de paiement de Mollie, ou rien à payer de plus (déjà payée). */
export type ShopSubmitResult =
  { kind: "PAID" } | { kind: "REDIRECT"; url: string };

/**
 * Coordonnées de l'acheteur et mode de remise (retrait ou livraison, RG-SHOP-14), puis le paiement Mollie, au montant de
 * la commande livraison comprise : créé sur le compte Mollie de l'organisation, sans commission Evoly (RG-SHOP-08), payé
 * sur la page de Mollie avec retour sur la page de la commande. Adresse bloquée par l'organisation : refus neutre,
 * produits libérés (RG-BLK-01).
 */
export async function submitShopBuyer(
  token: string,
  buyer: ShopBuyerInput,
  now = new Date(),
  opts: { returnUrl?: string } = {},
): Promise<ShopSubmitResult> {
  const id = await findShopOrderIdByToken(token);
  if (!id) throw new CoreError("ORDER_NOT_FOUND");
  const order = await db.shopOrder.findUniqueOrThrow({
    where: { id },
    include: {
      lines: {
        include: {
          product: { select: { pickupEnabled: true, shippingEnabled: true } },
        },
      },
      organization: { select: { country: true } },
    },
  });
  if (order.status === "PAID") return { kind: "PAID" };
  if (
    order.status !== "PENDING" ||
    !order.holdExpiresAt ||
    order.holdExpiresAt <= now
  )
    throw new CoreError("HOLD_EXPIRED");
  const pay = await paymentAccountFor(order.organizationId);
  if (!pay?.account.profileId || !opts.returnUrl)
    throw new CoreError("PAYMENTS_UNAVAILABLE");
  const api = mollieApi(
    await mollieAccessToken(pay.account),
    pay.account.testmode,
  );
  // paiement déjà ouvert : payé entre-temps (autre onglet), la commande est validée avec lui, à son montant
  const existing = order.molliePaymentId
    ? await api<MolliePayment>(`/payments/${order.molliePaymentId}`)
    : null;
  if (existing?.status === "paid") {
    await syncShopPaymentFromMollie(id);
    return { kind: "PAID" };
  }
  const email = buyer.email.trim().toLowerCase();
  const firstName = buyer.firstName.trim().slice(0, 80);
  const lastName = buyer.lastName.trim().slice(0, 80);
  if (!firstName || !lastName) throw new CoreError("BUYER_NAME_REQUIRED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    throw new CoreError("EMAIL_INVALID");
  if (await isBlocked(order.organizationId, { email })) {
    await cancelShopReservation(token);
    throw new CoreError(BUYER_BLOCKED);
  }
  const fulfillment = await fulfillmentData(order, buyer);
  // un paiement par carte vaut 15 minutes chez Mollie : les produits restent retenus jusque-là
  const until = new Date(now.getTime() + MOLLIE_HOLD_MS);
  const saved = await db.shopOrder.updateMany({
    where: { id, status: "PENDING" },
    data: {
      buyerFirstName: firstName,
      buyerLastName: lastName,
      buyerEmail: email,
      buyerEmailKey: buyerEmailKey(email),
      buyerPhone: buyer.phone?.trim().slice(0, 40) || null,
      marketingOptIn: !!buyer.marketingOptIn,
      termsVersion: SHOP_TERMS_VERSION,
      ...fulfillment,
      ...(order.holdExpiresAt < until ? { holdExpiresAt: until } : {}),
    },
  });
  if (saved.count !== 1) throw new CoreError("HOLD_EXPIRED");
  const totalMinor = fulfillment.totalMinor;
  // paiement encore ouvert au même montant : repris ; montant changé (autre mode de remise), un nouveau est créé, et
  // l'ancien, s'il est payé malgré tout, est remboursé (webhook)
  const checkout = existing?._links.checkout?.href;
  if (
    existing &&
    checkout &&
    (existing.status === "open" || existing.status === "pending") &&
    fromMollieAmount(existing.amount) === totalMinor
  )
    return { kind: "REDIRECT", url: checkout };
  const webhookUrl = mollieWebhookUrl(
    `/api/webhooks/mollie/boutique?commande=${order.id}`,
  );
  // RG-SHOP-08 : aucune commission Evoly sur les produits (pas de frais d'application)
  const payment = await api<MolliePayment>("/payments", {
    body: {
      amount: toMollieAmount(totalMinor, order.currency),
      description: `Boutique · ${order.reference}`,
      redirectUrl: opts.returnUrl,
      ...(webhookUrl ? { webhookUrl } : {}),
      locale: mollieLocale(order.locale, order.organization.country),
      profileId: pay.account.profileId,
      metadata: {
        shopOrderId: order.id,
        reference: order.reference,
        organizationId: order.organizationId,
      },
    },
    idempotencyKey: `shop-order:${order.id}:mollie-payment:${order.molliePaymentId ?? "1"}:${totalMinor}`,
  });
  const url = payment._links.checkout?.href;
  if (!url) throw new CoreError("PAYMENTS_UNAVAILABLE");
  await db.shopOrder.update({
    where: { id },
    data: { molliePaymentId: payment.id },
  });
  return { kind: "REDIRECT", url };
}

/** Paiement Mollie reçu pour une commande de la boutique, relu chez Mollie. */
export interface ShopPayment {
  molliePaymentId: string;
  amountMinor: number;
  currency: string;
  paymentMethodType: string | null;
  /** empreinte de la carte (personnes bloquées, RG-BLK-02), jamais un numéro de carte */
  cardFingerprint: string | null;
}

export type ShopFinalizeOutcome =
  "PAID" | "ALREADY_PAID" | "REFUND_REQUIRED" | "BLOCKED" | "IGNORED";

class NoStock extends Error {}

/**
 * RG-SHOP-07 : validation unique d'un paiement (webhook ou retour de l'acheteur). Les produits retenus deviennent vendus
 * (stock diminué) ; une réservation expirée entre-temps est reprise si le stock le permet, sinon le paiement est remboursé.
 */
async function finalizeShopOrder(
  orderId: string,
  payment: ShopPayment,
  now: Date,
): Promise<ShopFinalizeOutcome> {
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ status: string }>
      >`SELECT "status" FROM "ShopOrder" WHERE id = ${orderId} FOR UPDATE`;
      if (!rows.length) return "IGNORED";
      const o = await tx.shopOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: { lines: true },
      });
      if (o.status !== "PENDING" && o.status !== "EXPIRED")
        return o.paidAt && o.molliePaymentId === payment.molliePaymentId
          ? "ALREADY_PAID"
          : "IGNORED";
      if (
        payment.amountMinor !== o.totalMinor ||
        payment.currency.toUpperCase() !== o.currency ||
        o.molliePaymentId !== payment.molliePaymentId
      )
        return "IGNORED";
      for (const l of o.lines) {
        if (!l.variantId) continue;
        const sold =
          o.status === "PENDING"
            ? await tx.$executeRaw`
                UPDATE "ProductVariant" SET "held" = GREATEST("held" - ${l.quantity}, 0),
                  "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" - ${l.quantity} END,
                  "sold" = "sold" + ${l.quantity}
                WHERE id = ${l.variantId} AND ("stock" IS NULL OR "stock" >= ${l.quantity})`
            : await tx.$executeRaw`
                UPDATE "ProductVariant" SET
                  "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" - ${l.quantity} END,
                  "sold" = "sold" + ${l.quantity}
                WHERE id = ${l.variantId} AND ("stock" IS NULL OR "stock" - "held" >= ${l.quantity})`;
        if (sold !== 1) throw new NoStock();
      }
      await tx.shopOrder.update({
        where: { id: orderId },
        data: {
          status: "PAID",
          paidAt: now,
          holdExpiresAt: null,
          cancelledAt: null,
          paymentMethodType: payment.paymentMethodType,
          cardFingerprint: payment.cardFingerprint,
        },
      });
      return "PAID";
    }, TX_OPTIONS);
  } catch (err) {
    if (err instanceof NoStock) return "REFUND_REQUIRED";
    throw err;
  }
}

/**
 * Remboursement intégral d'un paiement Mollie de la boutique, sur le solde de l'organisation. La clé d'idempotence
 * (gardée une heure par Mollie) évite un double remboursement quand le webhook est rejoué.
 */
async function refundMolliePayment(
  api: MollieApi,
  payment: { id: string; amount: MollieAmount },
  orderId: string,
  reference: string,
  cause: string,
): Promise<void> {
  await api<MollieRefund>(`/payments/${payment.id}/refunds`, {
    body: {
      amount: payment.amount,
      description: `Remboursement ${reference}`,
      metadata: { shopOrderId: orderId, cause },
    },
    idempotencyKey: `shop-payment:${payment.id}:refund`,
  });
}

/**
 * Paiement reçu pour une commande qui ne peut pas être servie (stock repris entre-temps, carte bloquée) : remboursé en
 * entier, commande annulée et produits encore retenus libérés.
 */
async function refundWholePayment(
  orderId: string,
  payment: ShopPayment,
  why: "NO_STOCK" | "BLOCKED_CARD",
): Promise<void> {
  const order = await db.shopOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { organizationId: true, reference: true },
  });
  const mollie = await mollieForOrganization(order.organizationId);
  if (!mollie) throw new CoreError("PAYMENTS_UNAVAILABLE");
  await refundMolliePayment(
    mollie.api,
    {
      id: payment.molliePaymentId,
      amount: toMollieAmount(payment.amountMinor, payment.currency),
    },
    orderId,
    order.reference,
    why === "NO_STOCK" ? "unfulfilled" : "blocked",
  );
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "ShopOrder" WHERE id = ${orderId} AND "status" IN ('PENDING', 'EXPIRED') FOR UPDATE`;
    if (!rows.length) return;
    const o = await tx.shopOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { lines: true },
    });
    if (o.status === "PENDING") await releaseLines(tx, o.lines);
    await tx.shopOrder.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        holdExpiresAt: null,
        refundedMinor: payment.amountMinor,
        paymentMethodType: payment.paymentMethodType,
        cardFingerprint: payment.cardFingerprint,
      },
    });
  }, TX_OPTIONS);
  await audit({
    action: "shop.order_refunded_unfulfilled",
    organizationId: order.organizationId,
    actorType: "SYSTEM",
    targetType: "ShopOrder",
    targetId: orderId,
    metadata: { why },
  });
}

/**
 * Paiement d'une commande de la boutique reçu (webhook ou retour de l'acheteur) : carte bloquée par l'organisation,
 * paiement remboursé (RG-BLK-02, l'empreinte n'est connue qu'au paiement) ; sinon commande validée une seule fois,
 * e-mail de confirmation et notification de l'organisation.
 */
export async function completeShopOrder(
  orderId: string,
  payment: ShopPayment,
  now = new Date(),
): Promise<ShopFinalizeOutcome> {
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: { organizationId: true, status: true },
  });
  if (!order) return "IGNORED";
  if (
    (order.status === "PENDING" || order.status === "EXPIRED") &&
    payment.cardFingerprint &&
    (await isCardBlocked(order.organizationId, payment.cardFingerprint))
  ) {
    await refundWholePayment(orderId, payment, "BLOCKED_CARD");
    return "BLOCKED";
  }
  const outcome = await finalizeShopOrder(orderId, payment, now);
  if (outcome === "PAID") {
    const { afterShopOrderPaid } = await import("./shopOrders");
    await afterShopOrderPaid(orderId);
  }
  if (outcome === "REFUND_REQUIRED")
    await refundWholePayment(orderId, payment, "NO_STOCK").catch((err) =>
      console.error(
        "remboursement à reprendre (boutique)",
        orderId,
        safeError(err),
      ),
    );
  return outcome;
}

/** États des remboursements de la boutique, relus sur le paiement Mollie de la commande (Mollie appelle le webhook). */
async function syncShopRefunds(
  orderId: string,
  molliePaymentId: string,
  api: MollieApi,
): Promise<void> {
  const pending = await db.shopRefund.count({
    where: { orderId, mollieRefundId: { not: null }, status: "PROCESSING" },
  });
  if (pending === 0) return;
  const list = await api<MollieList<"refunds", MollieRefund>>(
    `/payments/${molliePaymentId}/refunds`,
    { query: { limit: 250 } },
  );
  for (const r of list._embedded.refunds) {
    const status = refundStatusFromMollie(r.status);
    await db.shopRefund.updateMany({
      where: { orderId, mollieRefundId: r.id, status: "PROCESSING" },
      data: {
        status,
        failureReason: status === "FAILED" ? "échec Mollie" : null,
      },
    });
  }
}

/**
 * Paiement relu chez Mollie (retour de l'acheteur, webhook ; le paiement en cours de la commande, ou un autre qu'elle a
 * créé) : payé, la commande est validée (RG-SHOP-07). Un paiement reçu sans commande à servir (réservation annulée
 * pendant le paiement, paiement remplacé par un autre après un changement du mode de remise, montant qui ne correspond
 * plus) est remboursé en entier, une seule fois. Commande déjà payée : états de ses remboursements. Rend l'état du
 * paiement chez Mollie, ou null.
 */
export async function syncShopPaymentFromMollie(
  orderId: string,
  molliePaymentId?: string,
): Promise<MolliePayment["status"] | null> {
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      molliePaymentId: true,
      organizationId: true,
      reference: true,
      refundedMinor: true,
    },
  });
  const paymentId = molliePaymentId ?? order?.molliePaymentId;
  if (!order || !paymentId) return null;
  const mollie = await mollieForOrganization(order.organizationId);
  if (!mollie) return null;
  const payment = await mollie.api<MolliePayment>(`/payments/${paymentId}`);
  // un paiement d'une autre commande n'est jamais traité ici
  if (payment.metadata?.shopOrderId !== orderId) return null;
  const current = paymentId === order.molliePaymentId;
  if (
    current &&
    ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.status)
  ) {
    await syncShopRefunds(orderId, paymentId, mollie.api);
    return payment.status;
  }
  if (payment.status !== "paid") return payment.status;
  if (current && (order.status === "PENDING" || order.status === "EXPIRED")) {
    const outcome = await completeShopOrder(orderId, {
      molliePaymentId: payment.id,
      amountMinor: fromMollieAmount(payment.amount),
      currency: payment.amount.currency,
      paymentMethodType: payment.method,
      cardFingerprint: payment.details?.cardFingerprint ?? null,
    });
    if (outcome !== "IGNORED") return payment.status;
  }
  // déjà remboursé (par Evoly : stock repris, carte bloquée ; ou chez Mollie) : rien de plus
  if (
    (current && order.refundedMinor > 0) ||
    (payment.amountRefunded && fromMollieAmount(payment.amountRefunded) > 0)
  )
    return payment.status;
  const why = !current
    ? "superseded"
    : order.status === "CANCELLED"
      ? "cancelled"
      : "unmatched";
  await refundMolliePayment(mollie.api, payment, orderId, order.reference, why);
  // réservation annulée puis payée : la page de la commande l'indique remboursée, le webhook suivant n'y revient pas
  if (why === "cancelled")
    await db.shopOrder.updateMany({
      where: { id: orderId, status: "CANCELLED", refundedMinor: 0 },
      data: {
        refundedMinor: fromMollieAmount(payment.amount),
        paymentMethodType: payment.method,
      },
    });
  await audit({
    action: "shop.payment_refunded_unmatched",
    organizationId: order.organizationId,
    actorType: "SYSTEM",
    targetType: "ShopOrder",
    targetId: orderId,
    metadata: { why },
  });
  return payment.status;
}

/**
 * Webhook Mollie de la boutique (`/api/webhooks/mollie/boutique?commande=…`) : seul l'identifiant du paiement arrive,
 * avec la commande dans l'adresse ; le paiement est relu avec le jeton de l'organisation et doit porter cette commande
 * dans ses métadonnées. Un paiement ou une commande inconnus sont ignorés (Mollie conseille de répondre 200).
 */
export async function handleShopMollieWebhook(
  molliePaymentId: string,
  orderId: string | null,
): Promise<void> {
  if (!/^tr_[A-Za-z0-9]+$/.test(molliePaymentId)) return;
  const order = await db.shopOrder.findFirst({
    where:
      orderId && /^[a-z0-9]{10,40}$/.test(orderId)
        ? { id: orderId }
        : { molliePaymentId },
    select: { id: true },
  });
  if (!order) return;
  try {
    await syncShopPaymentFromMollie(order.id, molliePaymentId);
  } catch (err) {
    // paiement d'un autre compte Mollie (adresse forgée) : introuvable avec le jeton de cette organisation
    if (err instanceof MollieError && err.status === 404) return;
    throw err;
  }
}
