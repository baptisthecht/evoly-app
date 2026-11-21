import "server-only";
import { CoreError, parseMajorToMinor } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { exponentFor } from "./events";
import { requireShop } from "./shop";

/**
 * Boutique, onglet « Retrait et livraison » (section 9.35 du CDC) : les lieux de retrait en main propre (nom, adresse,
 * instructions ; l'acheteur y montre le code QR de sa commande) et les modes de livraison simples, à prix fixe.
 */

export interface PickupPointInput {
  name: string;
  address: string;
  instructions?: string | null;
}

function parsePoint(input: PickupPointInput) {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  const address = input.address.trim().slice(0, 300);
  if (!name || !address) throw new CoreError("SHOP_PICKUP_INVALID");
  return {
    name,
    address,
    instructions: input.instructions?.trim().slice(0, 500) || null,
  };
}

function log(
  ctx: OrgContext,
  action: string,
  targetType: "PickupPoint" | "ShippingMethod",
  targetId: string,
) {
  return audit({
    action,
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType,
    targetId,
  });
}

export async function listPickupPoints(ctx: OrgContext) {
  requireShop(ctx);
  return db.pickupPoint.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** US-SHOP-03 : nouveau lieu de retrait. */
export async function createPickupPoint(
  ctx: OrgContext,
  input: PickupPointInput,
) {
  requireShop(ctx);
  const organizationId = ctx.organization.id;
  const point = await db.pickupPoint.create({
    data: {
      organizationId,
      ...parsePoint(input),
      sortOrder: await db.pickupPoint.count({ where: { organizationId } }),
    },
  });
  await log(ctx, "shop.pickup_created", "PickupPoint", point.id);
  return point;
}

async function ownPoint(ctx: OrgContext, id: string) {
  const point = await db.pickupPoint.findFirst({
    where: { id, organizationId: ctx.organization.id },
  });
  if (!point) throw new CoreError("NOT_FOUND");
  return point;
}

export async function updatePickupPoint(
  ctx: OrgContext,
  id: string,
  input: PickupPointInput,
) {
  requireShop(ctx);
  const point = await ownPoint(ctx, id);
  await db.pickupPoint.update({
    where: { id: point.id },
    data: parsePoint(input),
  });
  await log(ctx, "shop.pickup_updated", "PickupPoint", point.id);
}

/** Proposé aux acheteurs, ou plus (les commandes déjà passées gardent leur lieu). */
export async function setPickupPointActive(
  ctx: OrgContext,
  id: string,
  active: boolean,
) {
  requireShop(ctx);
  const point = await ownPoint(ctx, id);
  await db.pickupPoint.update({ where: { id: point.id }, data: { active } });
  await log(
    ctx,
    active ? "shop.pickup_enabled" : "shop.pickup_disabled",
    "PickupPoint",
    point.id,
  );
}

export async function deletePickupPoint(ctx: OrgContext, id: string) {
  requireShop(ctx);
  const point = await ownPoint(ctx, id);
  await db.pickupPoint.delete({ where: { id: point.id } });
  await log(ctx, "shop.pickup_deleted", "PickupPoint", point.id);
}

export interface ShippingMethodInput {
  name: string;
  /** prix TTC saisi (« 4,90 ») ; 0 : livraison offerte */
  price: string;
}

function parseMethod(input: ShippingMethodInput, currency: string) {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) throw new CoreError("SHOP_SHIPPING_INVALID");
  const priceMinor = parseMajorToMinor(input.price, exponentFor(currency));
  if (priceMinor == null) throw new CoreError("SHOP_AMOUNT_INVALID");
  return { name, priceMinor };
}

export async function listShippingMethods(ctx: OrgContext) {
  requireShop(ctx);
  return db.shippingMethod.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** US-SHOP-03 : nouveau mode de livraison, à prix fixe. */
export async function createShippingMethod(
  ctx: OrgContext,
  input: ShippingMethodInput,
) {
  requireShop(ctx);
  const organizationId = ctx.organization.id;
  const method = await db.shippingMethod.create({
    data: {
      organizationId,
      ...parseMethod(input, ctx.organization.currency),
      sortOrder: await db.shippingMethod.count({ where: { organizationId } }),
    },
  });
  await log(ctx, "shop.shipping_created", "ShippingMethod", method.id);
  return method;
}

async function ownMethod(ctx: OrgContext, id: string) {
  const method = await db.shippingMethod.findFirst({
    where: { id, organizationId: ctx.organization.id },
  });
  if (!method) throw new CoreError("NOT_FOUND");
  return method;
}

export async function updateShippingMethod(
  ctx: OrgContext,
  id: string,
  input: ShippingMethodInput,
) {
  requireShop(ctx);
  const method = await ownMethod(ctx, id);
  await db.shippingMethod.update({
    where: { id: method.id },
    data: parseMethod(input, ctx.organization.currency),
  });
  await log(ctx, "shop.shipping_updated", "ShippingMethod", method.id);
}

export async function setShippingMethodActive(
  ctx: OrgContext,
  id: string,
  active: boolean,
) {
  requireShop(ctx);
  const method = await ownMethod(ctx, id);
  await db.shippingMethod.update({
    where: { id: method.id },
    data: { active },
  });
  await log(
    ctx,
    active ? "shop.shipping_enabled" : "shop.shipping_disabled",
    "ShippingMethod",
    method.id,
  );
}

export async function deleteShippingMethod(ctx: OrgContext, id: string) {
  requireShop(ctx);
  const method = await ownMethod(ctx, id);
  await db.shippingMethod.delete({ where: { id: method.id } });
  await log(ctx, "shop.shipping_deleted", "ShippingMethod", method.id);
}
