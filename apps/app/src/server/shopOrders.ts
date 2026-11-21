import "server-only";
import {
  CoreError,
  formatVatRate,
  isTrackingUrl,
  normalizePickupCode,
  receivedAt,
  shippingAddressLines,
  shopOrderTotals,
  withdrawalOpen,
} from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { formatMoney, toLocale, type Locale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { toMollieAmount, type MollieRefund } from "@/lib/mollie";
import { safeError } from "@/lib/redact";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { emailBrandFor } from "./email/brand";
import { sendEmail } from "./email/send";
import {
  shopOrderConfirmedEmail,
  shopOrderReadyEmail,
  shopOrderShippedEmail,
  shopRefundEmail,
  shopWithdrawalEmail,
  type ShopReceipt,
} from "./email/shopTemplates";
import { mollieForOrganization } from "./mollieAccounts";
import { refundStatusFromMollie } from "./molliePayments";
import { notify } from "./notifications";
import { requireShop } from "./shop";
import { findShopOrderIdByToken, shopOrderToken } from "./shopCheckout";
import { organizationPublicUrl } from "./urls";

/**
 * Commandes de la boutique (lots 3b et 3d), section 9.35 du CDC : confirmation après paiement (e-mail avec le reçu,
 * notification de l'organisation), suivi par l'organisation (à préparer, prête à retirer, retirée ; ou expédiée avec un
 * numéro de suivi), retrait sur présentation du code QR, remboursements et droit de rétractation de 14 jours.
 */

/** Page de la commande pour l'acheteur (lien magique) : https://club.evoly.me/boutique/commande/<jeton>. */
export async function shopOrderUrl(orderId: string): Promise<string> {
  const o = await db.shopOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      accessTokenVersion: true,
      organization: { select: { subdomain: true, slug: true } },
    },
  });
  return `${organizationPublicUrl(o.organization.subdomain ?? o.organization.slug)}/boutique/commande/${shopOrderToken(orderId, o.accessTokenVersion)}`;
}

type OrderWithLines = Prisma.ShopOrderGetPayload<{ include: { lines: true } }>;

/** Reçu de la commande (RG-SHOP-10) : lignes, sous-total, livraison, total, TVA comprise de chaque taux. */
export function shopReceipt(
  order: OrderWithLines,
  locale: Locale,
): ShopReceipt {
  const money = (v: number) => formatMoney(v, order.currency, locale);
  const totals = shopOrderTotals(order.lines, {
    amountMinor: order.shippingMinor,
    vatRateBps: order.shippingVatBps,
  });
  return {
    lines: order.lines.map((l) => ({
      name: l.variantLabel
        ? `${l.productName} (${l.variantLabel})`
        : l.productName,
      quantity: l.quantity,
      total: money(l.unitPriceMinor * l.quantity),
    })),
    subtotal: money(order.subtotalMinor),
    shipping: order.shippingMinor > 0 ? money(order.shippingMinor) : null,
    total: money(order.totalMinor),
    vat: totals.vat.map((v) => ({
      rate: formatVatRate(v.rateBps, locale),
      amount: money(v.vatMinor),
    })),
  };
}

/**
 * Après la validation du paiement : e-mail de confirmation (reçu, lieu de retrait ou adresse de livraison), notification
 * de l'organisation.
 */
export async function afterShopOrderPaid(orderId: string): Promise<void> {
  const order = await db.shopOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true, organization: { select: { name: true } } },
  });
  const url = await shopOrderUrl(order.id);
  await mailBuyer(order, "shop.order_confirmed", (brand, locale) =>
    shopOrderConfirmedEmail({
      brand,
      locale,
      organizationName: order.organization.name,
      firstName: order.buyerFirstName ?? "",
      reference: order.reference,
      url,
      receipt: shopReceipt(order, locale),
      pickup:
        order.fulfillmentMode === "PICKUP" && order.pickupName
          ? {
              name: order.pickupName,
              address: order.pickupAddress ?? "",
              instructions: order.pickupInstructions,
            }
          : null,
      shipping:
        order.fulfillmentMode === "SHIPPING"
          ? {
              method: order.shippingName ?? "",
              address: shippingAddressLines(order, locale).join("\n"),
            }
          : null,
    }),
  );
  const items = order.lines.reduce((n, l) => n + l.quantity, 0);
  await notify(order.organizationId, "SHOP_ORDER_PAID", {
    title: `Commande de la boutique ${order.reference}`,
    body: `${[order.buyerFirstName, order.buyerLastName].filter(Boolean).join(" ")} : ${items} article${items > 1 ? "s" : ""}, ${formatMoney(order.totalMinor, order.currency, "fr")}.`,
    link: `/shop/orders/${order.id}`,
  });
}

/** E-mail à l'acheteur, au nom de l'organisation (sa marque, son adresse de réponse), dans sa langue. */
async function mailBuyer(
  order: {
    id: string;
    organizationId: string;
    buyerEmail: string | null;
    locale: string;
  },
  template: string,
  render: (
    brand: Awaited<ReturnType<typeof emailBrandFor>>,
    locale: Locale,
  ) =>
    | Promise<{ subject: string; html: string; text: string }>
    | { subject: string; html: string; text: string },
): Promise<void> {
  if (!order.buyerEmail) return;
  try {
    const brand = await emailBrandFor(order.organizationId);
    const locale = toLocale(order.locale);
    await sendEmail({
      ...(await render(brand, locale)),
      to: order.buyerEmail,
      template,
      category: "TRANSACTIONAL",
      organizationId: order.organizationId,
      locale,
      fromName: brand.fromName,
      replyTo: brand.replyTo,
    });
  } catch (err) {
    console.error(`e-mail ${template}`, order.id, safeError(err));
  }
}

export type ShopOrderFilter = "TO_PREPARE" | "READY" | "DONE" | "ALL";

export interface ShopOrderRow {
  id: string;
  reference: string;
  buyer: string;
  email: string;
  items: number;
  totalMinor: number;
  currency: string;
  status: string;
  fulfillmentStatus: string;
  fulfillmentMode: string;
  withdrawal: boolean;
  createdAt: Date;
}

/** Boutique, onglet Commandes : commandes payées (ou remboursées), les plus récentes d'abord, filtrées par état. */
export async function listShopOrders(
  ctx: OrgContext,
  filter: ShopOrderFilter = "ALL",
): Promise<ShopOrderRow[]> {
  requireShop(ctx);
  const orders = await db.shopOrder.findMany({
    where: {
      organizationId: ctx.organization.id,
      // à préparer, prêtes : commandes encore dues (non remboursées en entier) ; toutes et terminées : aussi remboursées
      status: {
        in:
          filter === "TO_PREPARE" || filter === "READY"
            ? ["PAID", "PARTIALLY_REFUNDED"]
            : ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"],
      },
      ...(filter === "TO_PREPARE"
        ? { fulfillmentStatus: "TO_PREPARE" }
        : filter === "READY"
          ? { fulfillmentStatus: "READY" }
          : filter === "DONE"
            ? { fulfillmentStatus: { in: ["PICKED_UP", "SHIPPED"] } }
            : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { lines: { select: { quantity: true } } },
  });
  return orders.map((o) => ({
    id: o.id,
    reference: o.reference,
    buyer: [o.buyerFirstName, o.buyerLastName].filter(Boolean).join(" "),
    email: o.buyerEmail ?? "",
    items: o.lines.reduce((n, l) => n + l.quantity, 0),
    totalMinor: o.totalMinor,
    currency: o.currency,
    status: o.status,
    fulfillmentStatus: o.fulfillmentStatus,
    fulfillmentMode: o.fulfillmentMode,
    withdrawal: !!o.withdrawalRequestedAt,
    createdAt: o.createdAt,
  }));
}

/** Nombre de commandes à préparer (pastille de l'onglet). */
export async function shopOrdersToPrepare(ctx: OrgContext): Promise<number> {
  return db.shopOrder.count({
    where: {
      organizationId: ctx.organization.id,
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      fulfillmentStatus: "TO_PREPARE",
    },
  });
}

export async function getShopOrder(ctx: OrgContext, orderId: string) {
  requireShop(ctx);
  const order = await db.shopOrder.findFirst({
    where: {
      id: orderId,
      organizationId: ctx.organization.id,
      status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] },
    },
    include: {
      lines: { orderBy: { id: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) throw new CoreError("NOT_FOUND");
  return order;
}

function log(
  ctx: OrgContext,
  action: string,
  orderId: string,
  metadata?: Record<string, string | number | boolean>,
) {
  return audit({
    action,
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "ShopOrder",
    targetId: orderId,
    ...(metadata ? { metadata } : {}),
  });
}

/** RG-SHOP-09 : commande prête à retirer ; l'acheteur reçoit un e-mail avec son code de retrait. */
export async function markShopOrderReady(ctx: OrgContext, orderId: string) {
  const order = await getShopOrder(ctx, orderId);
  if (order.fulfillmentMode !== "PICKUP" || order.status === "REFUNDED")
    throw new CoreError("SHOP_ORDER_STATE");
  if (order.fulfillmentStatus !== "TO_PREPARE") return;
  await db.shopOrder.update({
    where: { id: order.id },
    data: { fulfillmentStatus: "READY", readyAt: new Date() },
  });
  await log(ctx, "shop.order_ready", order.id);
  const url = await shopOrderUrl(order.id);
  await mailBuyer(order, "shop.order_ready", (brand, locale) =>
    shopOrderReadyEmail({
      brand,
      locale,
      organizationName: ctx.organization.name,
      firstName: order.buyerFirstName ?? "",
      reference: order.reference,
      url,
      pickup: {
        name: order.pickupName ?? "",
        address: order.pickupAddress ?? "",
        instructions: order.pickupInstructions,
      },
    }),
  );
}

/** RG-SHOP-09 : remise en main propre (bouton de la fiche, ou code QR scanné) ; une seule fois. */
export async function markShopOrderPickedUp(ctx: OrgContext, orderId: string) {
  const order = await getShopOrder(ctx, orderId);
  if (order.fulfillmentMode !== "PICKUP" || order.status === "REFUNDED")
    throw new CoreError("SHOP_ORDER_STATE");
  if (order.fulfillmentStatus === "PICKED_UP")
    throw new CoreError("SHOP_ALREADY_PICKED_UP");
  await db.shopOrder.update({
    where: { id: order.id },
    data: { fulfillmentStatus: "PICKED_UP", pickedUpAt: new Date() },
  });
  await log(ctx, "shop.order_picked_up", order.id);
}

/**
 * RG-SHOP-15 : commande expédiée, une seule fois ; transporteur, numéro et lien de suivi (https) ; l'acheteur reçoit un
 * e-mail avec le lien. Les 14 jours de rétractation partent de la livraison estimée (RG-SHOP-11).
 */
export async function markShopOrderShipped(
  ctx: OrgContext,
  orderId: string,
  input: { carrier: string; trackingNumber: string; trackingUrl: string },
) {
  const order = await getShopOrder(ctx, orderId);
  if (order.fulfillmentMode !== "SHIPPING" || order.status === "REFUNDED")
    throw new CoreError("SHOP_ORDER_STATE");
  const carrier = input.carrier.replace(/\s+/g, " ").trim().slice(0, 60);
  const trackingNumber = input.trackingNumber.replace(/\s+/g, "").slice(0, 80);
  const trackingUrl = input.trackingUrl.trim().slice(0, 500);
  if (!carrier || !trackingNumber || !isTrackingUrl(trackingUrl))
    throw new CoreError("SHOP_TRACKING_INVALID");
  const done = await db.shopOrder.updateMany({
    where: { id: order.id, fulfillmentStatus: "TO_PREPARE" },
    data: {
      fulfillmentStatus: "SHIPPED",
      shippedAt: new Date(),
      carrier,
      trackingNumber,
      trackingUrl,
    },
  });
  if (done.count === 0) throw new CoreError("SHOP_ORDER_STATE");
  await log(ctx, "shop.order_shipped", order.id, { carrier });
  const url = await shopOrderUrl(order.id);
  await mailBuyer(order, "shop.order_shipped", (brand, locale) =>
    shopOrderShippedEmail({
      brand,
      locale,
      organizationName: ctx.organization.name,
      firstName: order.buyerFirstName ?? "",
      reference: order.reference,
      url,
      carrier,
      trackingNumber,
      trackingUrl,
    }),
  );
}

/** Retrait : la commande d'un code QR scanné (ou saisi), dans cette organisation seulement. */
export async function findShopOrderByPickupCode(ctx: OrgContext, code: string) {
  requireShop(ctx);
  const clean = normalizePickupCode(code);
  if (clean.length !== 10) throw new CoreError("NOT_FOUND");
  const order = await db.shopOrder.findUnique({
    where: { pickupCode: clean },
    select: { id: true, organizationId: true, status: true },
  });
  if (
    !order ||
    order.organizationId !== ctx.organization.id ||
    !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.status)
  )
    throw new CoreError("NOT_FOUND");
  return getShopOrder(ctx, order.id);
}

/**
 * RG-SHOP-12 : remboursement par l'organisation (rétractation ou décision), ligne par ligne, avec ou sans la livraison ;
 * sur le paiement Mollie de l'acheteur, pris sur le solde Mollie de l'organisation ; les articles rendus reviennent au
 * stock si demandé.
 */
export async function refundShopOrder(
  ctx: OrgContext,
  orderId: string,
  input: {
    lines: Array<{ lineId: string; quantity: number }>;
    restock: boolean;
    /** rembourser aussi les frais de livraison, une seule fois */
    shipping?: boolean;
  },
) {
  const order = await getShopOrder(ctx, orderId);
  if (order.status === "REFUNDED") throw new CoreError("SHOP_ORDER_STATE");
  const picked = input.lines
    .map((r) => ({
      line: order.lines.find((l) => l.id === r.lineId),
      quantity: Math.floor(r.quantity),
    }))
    .filter((r) => r.quantity > 0);
  if (
    picked.some(
      (r) => !r.line || r.quantity > r.line.quantity - r.line.refundedQuantity,
    )
  )
    throw new CoreError("SHOP_REFUND_INVALID");
  if (input.shipping && (order.shippingMinor <= 0 || order.shippingRefunded))
    throw new CoreError("SHOP_REFUND_INVALID");
  const shippingMinor = input.shipping ? order.shippingMinor : 0;
  const amount =
    picked.reduce((n, r) => n + r.line!.unitPriceMinor * r.quantity, 0) +
    shippingMinor;
  if (amount <= 0 || amount > order.totalMinor - order.refundedMinor)
    throw new CoreError("SHOP_REFUND_INVALID");
  const mollie = await mollieForOrganization(order.organizationId);
  if (!mollie || !order.molliePaymentId)
    throw new CoreError("MOLLIE_RECONNECT_REQUIRED");
  const refund = await db.shopRefund.create({
    data: {
      orderId: order.id,
      amountMinor: amount,
      reason: order.withdrawalRequestedAt ? "WITHDRAWAL" : "ORGANIZER",
      createdById: ctx.user.id,
    },
  });
  let mollieRefund: MollieRefund;
  try {
    mollieRefund = await mollie.api<MollieRefund>(
      `/payments/${order.molliePaymentId}/refunds`,
      {
        body: {
          amount: toMollieAmount(amount, order.currency),
          description: `Remboursement ${order.reference}`,
          metadata: { shopOrderId: order.id, shopRefundId: refund.id },
        },
        idempotencyKey: `shop-refund:${refund.id}`,
      },
    );
  } catch (err) {
    await db.shopRefund.update({
      where: { id: refund.id },
      data: { status: "FAILED", failureReason: "refus de Mollie" },
    });
    console.error("remboursement boutique refusé", order.id, safeError(err));
    throw new CoreError("REFUND_FAILED");
  }
  // état final suivi par le webhook du paiement (en attente d'un solde suffisant : « queued »)
  const status = refundStatusFromMollie(mollieRefund.status);
  await db.$transaction(async (tx) => {
    await tx.shopRefund.update({
      where: { id: refund.id },
      data: {
        mollieRefundId: mollieRefund.id,
        status,
        failureReason: status === "FAILED" ? "échec Mollie" : null,
      },
    });
    for (const r of picked) {
      await tx.shopOrderLine.update({
        where: { id: r.line!.id },
        data: { refundedQuantity: { increment: r.quantity } },
      });
      if (input.restock && r.line!.variantId)
        await tx.$executeRaw`UPDATE "ProductVariant" SET "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" + ${r.quantity} END, "sold" = GREATEST("sold" - ${r.quantity}, 0) WHERE id = ${r.line!.variantId}`;
    }
    // montant ajouté à celui déjà remboursé (deux remboursements au même instant ne s'écrasent pas)
    const done = await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        refundedMinor: { increment: amount },
        ...(shippingMinor ? { shippingRefunded: true } : {}),
      },
      select: { refundedMinor: true, totalMinor: true },
    });
    await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        status:
          done.refundedMinor >= done.totalMinor
            ? "REFUNDED"
            : "PARTIALLY_REFUNDED",
      },
    });
  });
  await log(ctx, "shop.order_refunded", order.id, {
    amountMinor: amount,
    restock: input.restock,
    shipping: shippingMinor > 0,
  });
  const url = await shopOrderUrl(order.id);
  await mailBuyer(order, "shop.order_refunded", (brand, locale) =>
    shopRefundEmail({
      brand,
      locale,
      organizationName: ctx.organization.name,
      firstName: order.buyerFirstName ?? "",
      reference: order.reference,
      amount: formatMoney(amount, order.currency, locale),
      url,
    }),
  );
  return { amountMinor: amount };
}

/**
 * Commande vue par l'acheteur (lien magique) : lignes, reçu, lieu de retrait ou livraison, état, rétractation possible.
 */
export async function shopOrderForBuyer(token: string, now = new Date()) {
  const id = await findShopOrderIdByToken(token);
  if (!id) return null;
  const order = await db.shopOrder.findUniqueOrThrow({
    where: { id },
    include: {
      lines: { orderBy: { id: "asc" } },
      organization: { select: { name: true, contactEmail: true } },
    },
  });
  return {
    order,
    canWithdraw:
      !order.withdrawalRequestedAt &&
      withdrawalOpen(
        {
          status: order.status,
          totalMinor: order.totalMinor,
          refundedMinor: order.refundedMinor,
          receivedAt: receivedAt(order),
        },
        now,
      ),
  };
}

/**
 * RG-SHOP-11 : l'acheteur se rétracte depuis la page de sa commande (14 jours après la réception, ou avant) ;
 * l'organisation est prévenue et le rembourse au retour des produits. Une seule demande par commande.
 */
export async function requestShopWithdrawal(
  token: string,
  now = new Date(),
): Promise<void> {
  const found = await shopOrderForBuyer(token, now);
  if (!found) throw new CoreError("ORDER_NOT_FOUND");
  const { order } = found;
  if (order.withdrawalRequestedAt) return;
  if (!found.canWithdraw) throw new CoreError("SHOP_WITHDRAWAL_CLOSED");
  const done = await db.shopOrder.updateMany({
    where: { id: order.id, withdrawalRequestedAt: null },
    data: { withdrawalRequestedAt: now },
  });
  if (done.count === 0) return;
  await audit({
    action: "shop.withdrawal_requested",
    organizationId: order.organizationId,
    actorType: "SYSTEM",
    targetType: "ShopOrder",
    targetId: order.id,
  });
  await notify(order.organizationId, "SHOP_WITHDRAWAL", {
    title: `Rétractation : ${order.reference}`,
    body: `${[order.buyerFirstName, order.buyerLastName].filter(Boolean).join(" ")} se rétracte. Remboursez la commande au retour des produits.`,
    link: `/shop/orders/${order.id}`,
  });
  const url = await shopOrderUrl(order.id);
  await mailBuyer(order, "shop.withdrawal", (brand, locale) =>
    shopWithdrawalEmail({
      brand,
      locale,
      organizationName: order.organization.name,
      firstName: order.buyerFirstName ?? "",
      reference: order.reference,
      url,
    }),
  );
}
