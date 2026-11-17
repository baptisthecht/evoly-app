import "server-only";
import { createHmac } from "node:crypto";
import {
  buyerEmailKey,
  CoreError,
  effectivePlan,
  hasFeature,
  humanCode,
  sha256Hex,
  shopOrderTotals,
  SHOP_CART_LIMITS,
  variantAvailable,
} from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { safeError } from "@/lib/redact";
import { audit } from "./audit";
import { BUYER_BLOCKED, isBlocked, isCardBlocked } from "./blockedBuyers";
import { cancelPaymentIntents, cardFailure } from "./checkout";
import { getPlans } from "./plans";
import { PLAN_SUBSCRIPTION_SELECT } from "./planSelect";

/**
 * Boutique publique (lot 3b), section 9.35 du CDC : panier, réservation atomique des produits, coordonnées et lieu de
 * retrait, paiement sur le compte Stripe de l'organisation sans commission Evoly, validation unique du paiement,
 * réservations expirées libérées. Les commandes de la boutique sont séparées des commandes de billets.
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

/** Annule une réservation encore en attente : produits libérés, paiement Stripe annulé (acheteur bloqué, abandon). */
export async function cancelShopReservation(token: string): Promise<void> {
  const id = await findShopOrderIdByToken(token);
  if (!id) return;
  const order = await db.$transaction(async (tx) => {
    const o = await tx.shopOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!o || o.status !== "PENDING") return null;
    await releaseLines(tx, o.lines);
    await tx.shopOrder.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        holdExpiresAt: null,
      },
    });
    return o;
  });
  if (order?.stripePaymentIntentId)
    await cancelPaymentIntents(order.organizationId, [
      { paymentIntentId: order.stripePaymentIntentId },
    ]);
}

/** Tâche planifiée (chaque minute) : réservations expirées de la boutique libérées, paiements annulés. */
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
      if (!rows.length) return null;
      const o = await tx.shopOrder.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });
      await releaseLines(tx, o.lines);
      await tx.shopOrder.update({
        where: { id },
        data: { status: "EXPIRED" },
      });
      return o;
    }, TX_OPTIONS);
    if (!released) continue;
    count += 1;
    if (released.stripePaymentIntentId)
      await cancelPaymentIntents(released.organizationId, [
        { paymentIntentId: released.stripePaymentIntentId },
      ]);
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
      lines: { orderBy: { id: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  const points =
    order.status === "PENDING"
      ? await db.pickupPoint.findMany({
          where: { organizationId: order.organizationId, active: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, address: true, instructions: true },
        })
      : [];
  const account = await db.stripeAccount.findUnique({
    where: { organizationId: order.organizationId },
    select: { stripeAccountId: true, chargesEnabled: true },
  });
  return {
    order,
    points,
    expired:
      order.status === "PENDING" &&
      (!order.holdExpiresAt || order.holdExpiresAt <= now),
    stripeAccountId: account?.chargesEnabled ? account.stripeAccountId : null,
  };
}

export interface ShopBuyerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  marketingOptIn?: boolean;
  pickupPointId: string;
}

/**
 * Coordonnées de l'acheteur et lieu de retrait, puis l'intention de paiement : charge directe sur le compte de
 * l'organisation, sans commission Evoly (RG-SHOP-08). Adresse bloquée par l'organisation : refus neutre, produits
 * libérés (RG-BLK-01).
 */
export async function submitShopBuyer(
  token: string,
  buyer: ShopBuyerInput,
  now = new Date(),
): Promise<{ clientSecret: string; stripeAccountId: string } | { paid: true }> {
  const id = await findShopOrderIdByToken(token);
  if (!id) throw new CoreError("ORDER_NOT_FOUND");
  const order = await db.shopOrder.findUniqueOrThrow({
    where: { id },
    include: {
      lines: { include: { product: { select: { pickupEnabled: true } } } },
    },
  });
  if (order.status === "PAID") return { paid: true };
  if (
    order.status !== "PENDING" ||
    !order.holdExpiresAt ||
    order.holdExpiresAt <= now
  )
    throw new CoreError("HOLD_EXPIRED");
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
  const point = await db.pickupPoint.findFirst({
    where: {
      id: buyer.pickupPointId,
      organizationId: order.organizationId,
      active: true,
    },
  });
  if (!point || order.lines.some((l) => l.product && !l.product.pickupEnabled))
    throw new CoreError("SHOP_PICKUP_REQUIRED");
  await db.shopOrder.update({
    where: { id },
    data: {
      buyerFirstName: firstName,
      buyerLastName: lastName,
      buyerEmail: email,
      buyerEmailKey: buyerEmailKey(email),
      buyerPhone: buyer.phone?.trim().slice(0, 40) || null,
      marketingOptIn: !!buyer.marketingOptIn,
      fulfillmentMode: "PICKUP",
      pickupPointId: point.id,
      pickupName: point.name,
      pickupAddress: point.address,
      pickupInstructions: point.instructions,
      termsVersion: SHOP_TERMS_VERSION,
    },
  });
  const s = stripe();
  const account = await db.stripeAccount.findUnique({
    where: { organizationId: order.organizationId },
    select: { stripeAccountId: true, chargesEnabled: true },
  });
  if (!s || !account?.chargesEnabled)
    throw new CoreError("PAYMENTS_UNAVAILABLE");
  const options = { stripeAccount: account.stripeAccountId };
  if (order.stripePaymentIntentId) {
    const existing = await s.paymentIntents.retrieve(
      order.stripePaymentIntentId,
      {},
      options,
    );
    if (existing.status === "succeeded") return { paid: true };
    if (existing.status !== "canceled" && existing.client_secret) {
      await s.paymentIntents.update(
        existing.id,
        { receipt_email: email },
        options,
      );
      return {
        clientSecret: existing.client_secret,
        stripeAccountId: account.stripeAccountId,
      };
    }
  }
  // RG-SHOP-08 : aucune commission Evoly sur les produits (pas de frais d'application)
  const intent = await s.paymentIntents.create(
    {
      amount: order.totalMinor,
      currency: order.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: email,
      description: `Boutique · ${order.reference}`,
      metadata: {
        shopOrderId: order.id,
        reference: order.reference,
        organizationId: order.organizationId,
      },
    },
    {
      ...options,
      idempotencyKey: `shop-order:${order.id}:payment-intent:${order.stripePaymentIntentId ?? "1"}`,
    },
  );
  await db.shopOrder.update({
    where: { id },
    data: { stripePaymentIntentId: intent.id },
  });
  return {
    clientSecret: intent.client_secret!,
    stripeAccountId: account.stripeAccountId,
  };
}

/**
 * Paiement confirmé par le serveur depuis le jeton de confirmation du navigateur (rien n'est encore débité) : la carte
 * est lue d'abord ; bloquée par l'organisation, elle est refusée avant le débit (RG-BLK-02).
 */
export async function confirmShopPayment(
  token: string,
  confirmationTokenId: string,
  returnUrl: string,
): Promise<{ kind: "DONE" } | { kind: "ACTION"; clientSecret: string }> {
  if (!/^ctoken_[A-Za-z0-9]{8,120}$/.test(confirmationTokenId))
    throw new CoreError("PAYMENT_INVALID");
  const id = await findShopOrderIdByToken(token);
  if (!id) throw new CoreError("ORDER_NOT_FOUND");
  const order = await db.shopOrder.findUniqueOrThrow({ where: { id } });
  if (order.status !== "PENDING" || !order.stripePaymentIntentId)
    throw new CoreError("PAYMENT_INVALID");
  const account = await db.stripeAccount.findUnique({
    where: { organizationId: order.organizationId },
    select: { stripeAccountId: true },
  });
  const s = stripe();
  if (!s || !account) throw new CoreError("STRIPE_NOT_CONFIGURED");
  const options = { stripeAccount: account.stripeAccountId };
  const ct = await s.confirmationTokens
    .retrieve(confirmationTokenId, {}, options)
    .catch((e: unknown) => {
      throw cardFailure(e);
    });
  const fingerprint = ct.payment_method_preview?.card?.fingerprint ?? null;
  if (
    await isBlocked(order.organizationId, {
      email: order.buyerEmail,
      fingerprint,
    })
  ) {
    await cancelShopReservation(token);
    throw new CoreError(BUYER_BLOCKED);
  }
  if (fingerprint)
    await db.shopOrder.update({
      where: { id },
      data: { cardFingerprint: fingerprint },
    });
  const intent = await s.paymentIntents
    .confirm(
      order.stripePaymentIntentId,
      { confirmation_token: confirmationTokenId, return_url: returnUrl },
      options,
    )
    .catch((e: unknown) => {
      throw cardFailure(e);
    });
  if (intent.status === "requires_action" && intent.client_secret)
    return { kind: "ACTION", clientSecret: intent.client_secret };
  if (intent.status === "succeeded" || intent.status === "processing")
    return { kind: "DONE" };
  throw new CoreError("CARD_DECLINED");
}

export interface ShopPayment {
  paymentIntentId: string;
  amountMinor: number;
  currency: string;
  chargeId: string | null;
  paymentMethodType: string | null;
}

export type ShopFinalizeOutcome =
  "PAID" | "ALREADY_PAID" | "REFUND_REQUIRED" | "IGNORED";

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
      if (
        o.status !== "PENDING" &&
        o.status !== "EXPIRED" &&
        o.status !== "CANCELLED"
      )
        return o.stripePaymentIntentId === payment.paymentIntentId
          ? "ALREADY_PAID"
          : "IGNORED";
      if (
        payment.amountMinor !== o.totalMinor ||
        payment.currency.toUpperCase() !== o.currency ||
        o.stripePaymentIntentId !== payment.paymentIntentId
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
          stripeChargeId: payment.chargeId,
          paymentMethodType: payment.paymentMethodType,
        },
      });
      return "PAID";
    }, TX_OPTIONS);
  } catch (err) {
    if (err instanceof NoStock) return "REFUND_REQUIRED";
    throw err;
  }
}

/** Paiement reçu pour une commande qui ne peut plus être servie (stock repris entre-temps) : remboursé en entier. */
async function refundWholePayment(
  orderId: string,
  why: "NO_STOCK" | "BLOCKED_CARD",
): Promise<void> {
  const order = await db.shopOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  const s = stripe();
  const account = await db.stripeAccount.findUnique({
    where: { organizationId: order.organizationId },
    select: { stripeAccountId: true },
  });
  if (!s || !account || !order.stripePaymentIntentId) return;
  await s.refunds.create(
    { payment_intent: order.stripePaymentIntentId },
    {
      stripeAccount: account.stripeAccountId,
      idempotencyKey: `shop-order:${order.id}:unfulfilled-refund`,
    },
  );
  await db.shopOrder.update({
    where: { id: orderId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      refundedMinor: order.totalMinor,
    },
  });
  await audit({
    action: "shop.order_refunded_unfulfilled",
    organizationId: order.organizationId,
    actorType: "SYSTEM",
    targetType: "ShopOrder",
    targetId: order.id,
    metadata: { why },
  });
}

/**
 * Paiement d'une commande de la boutique reçu (webhook payment_intent.succeeded ou retour de l'acheteur) : carte bloquée
 * passée outre la vérification, remboursée (RG-BLK-02) ; sinon commande validée une seule fois, frais relevés, e-mail
 * de confirmation et notification de l'organisation.
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
  if (payment.chargeId && order.status !== "PAID") {
    const fingerprint = await chargeFingerprint(
      order.organizationId,
      payment.chargeId,
    );
    if (
      fingerprint &&
      (await isCardBlocked(order.organizationId, fingerprint))
    ) {
      await refundWholePayment(orderId, "BLOCKED_CARD");
      return "IGNORED";
    }
  }
  const outcome = await finalizeShopOrder(orderId, payment, now);
  if (outcome === "PAID") {
    if (payment.chargeId)
      await recordShopStripeFees(orderId, payment.chargeId).catch((err) =>
        console.error(
          "frais Stripe à relever (boutique)",
          orderId,
          safeError(err),
        ),
      );
    const { afterShopOrderPaid } = await import("./shopOrders");
    await afterShopOrderPaid(orderId);
  }
  if (outcome === "REFUND_REQUIRED")
    await refundWholePayment(orderId, "NO_STOCK").catch((err) =>
      console.error(
        "remboursement à reprendre (boutique)",
        orderId,
        safeError(err),
      ),
    );
  return outcome;
}

async function chargeFingerprint(
  organizationId: string,
  chargeId: string,
): Promise<string | null> {
  const s = stripe();
  const account = await db.stripeAccount.findUnique({
    where: { organizationId },
    select: { stripeAccountId: true },
  });
  if (!s || !account) return null;
  const charge = await s.charges
    .retrieve(chargeId, {}, { stripeAccount: account.stripeAccountId })
    .catch(() => null);
  return charge?.payment_method_details?.card?.fingerprint ?? null;
}

/** Frais réels de Stripe relevés sur la commande (comme pour les billets), dès que la transaction existe. */
export async function recordShopStripeFees(
  orderId: string,
  chargeId: string,
): Promise<boolean> {
  const s = stripe();
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: { organizationId: true, currency: true },
  });
  const account = order
    ? await db.stripeAccount.findUnique({
        where: { organizationId: order.organizationId },
        select: { stripeAccountId: true },
      })
    : null;
  if (!s || !order || !account) return false;
  const charge = await s.charges.retrieve(
    chargeId,
    { expand: ["balance_transaction"] },
    { stripeAccount: account.stripeAccountId },
  );
  const bt = charge.balance_transaction as
    | {
        currency: string;
        net: number;
        fee_details: Array<{ type: string; amount: number }>;
      }
    | string
    | null;
  if (!bt || typeof bt === "string") return false;
  if (bt.currency.toUpperCase() !== order.currency) return true;
  await db.shopOrder.update({
    where: { id: orderId },
    data: {
      paymentFeeMinor: bt.fee_details
        .filter((f) => f.type === "stripe_fee")
        .reduce((n, f) => n + f.amount, 0),
      netMinor: bt.net,
    },
  });
  return true;
}

/** Événement charge.updated : frais d'une commande de la boutique, s'ils manquent encore. */
export async function shopFeesForCharge(chargeId: string): Promise<boolean> {
  const order = await db.shopOrder.findUnique({
    where: { stripeChargeId: chargeId },
    select: { id: true, paymentFeeMinor: true },
  });
  if (!order || order.paymentFeeMinor !== null) return false;
  return recordShopStripeFees(order.id, chargeId);
}

/** Au retour de Stripe : la commande est validée sans attendre le webhook si le paiement est déjà confirmé. */
export async function syncShopPaymentFromStripe(
  orderId: string,
): Promise<void> {
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: { status: true, stripePaymentIntentId: true, organizationId: true },
  });
  const s = stripe();
  if (!s || !order?.stripePaymentIntentId || order.status !== "PENDING") return;
  const account = await db.stripeAccount.findUnique({
    where: { organizationId: order.organizationId },
    select: { stripeAccountId: true },
  });
  if (!account) return;
  const pi = await s.paymentIntents.retrieve(
    order.stripePaymentIntentId,
    {},
    { stripeAccount: account.stripeAccountId },
  );
  if (pi.status !== "succeeded") return;
  await completeShopOrder(orderId, {
    paymentIntentId: pi.id,
    amountMinor: pi.amount_received,
    currency: pi.currency,
    chargeId:
      typeof pi.latest_charge === "string"
        ? pi.latest_charge
        : (pi.latest_charge?.id ?? null),
    paymentMethodType: pi.payment_method_types[0] ?? null,
  });
}
