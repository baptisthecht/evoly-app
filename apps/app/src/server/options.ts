import "server-only";
import {
  CoreError,
  effectivePlan,
  hasFeature,
  normalizeShortCode,
  optionCommission,
  optionLineName,
  parseMajorToMinor,
  variantAvailable,
  type FeeTerms,
} from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { exponentFor, findEvent } from "./events";
import { getPlans } from "./plans";
import { PLAN_SUBSCRIPTION_SELECT } from "@/server/planSelect";

/**
 * Options et consommations prépayées (section 9.29, Pro) : jetons boisson, vestiaire, t-shirt…
 * Des articles vendus avec le billet et retirés au bar sur un scan, jamais un solde d'argent (RG-OPT-02).
 */
export type OptionFormInput = {
  name: string;
  description?: string;
  price: string;
  stock?: string;
  maxPerOrder?: string;
  standalone?: boolean;
  /** produit de la boutique repris (section 9.35) : nom, prix et stock viennent du produit */
  productId?: string | null;
};
/**
 * Option demandée ; produit de la boutique : la variante choisie (`variantId`, ou l'identifiant composé
 * « option:variante » des lignes proposées par publicOptions).
 */
export type RequestedOption = {
  optionId: string;
  quantity: number;
  variantId?: string | null;
};
export type PricedOptions = {
  lines: Array<{
    optionId: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    unitFeeMinor: number;
    productVariantId?: string;
    variantLabel?: string;
  }>;
  subtotalMinor: number;
  feeMinor: number;
};
export const NO_OPTIONS: PricedOptions = {
  lines: [],
  subtotalMinor: 0,
  feeMinor: 0,
};

/** Commandes dont les options comptent dans le stock : payées, ou réservées et pas encore expirées. */
const counting = (now: Date): Prisma.OrderWhereInput => ({
  OR: [
    { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    { status: "PENDING", holdExpiresAt: { gt: now } },
  ],
});

/**
 * RG-SHOP-13 : option reprise d'un produit de la boutique (Pro, produit non archivé de l'organisation) : nom, prix de
 * base et description du produit ; aucun stock propre, celui des variantes est partagé avec la boutique.
 */
async function productData(
  ctx: OrgContext,
  input: OptionFormInput,
  base: { maxPerOrder: number; standalone: boolean },
) {
  if (!hasFeature(ctx.features, "SHOP")) throw new CoreError("PRO_REQUIRED");
  const product = await db.product.findFirst({
    where: {
      id: input.productId!,
      organizationId: ctx.organization.id,
      status: { not: "ARCHIVED" },
    },
  });
  if (!product) throw new CoreError("NOT_FOUND");
  return {
    name: product.name.slice(0, 80),
    description: product.description?.slice(0, 300) || null,
    priceMinor: product.priceMinor,
    stock: null,
    productId: product.id,
    ...base,
  };
}

/** Données d'une option : libre (saisie contrôlée), ou reprise d'un produit de la boutique. */
async function optionData(
  ctx: OrgContext,
  input: OptionFormInput,
  currency: string,
) {
  if (!input.productId) return { ...parse(input, currency), productId: null };
  const { maxPerOrder, standalone } = parse(
    { ...input, name: "x", price: "0", stock: "" },
    currency,
  );
  return productData(ctx, input, { maxPerOrder, standalone });
}

function parse(input: OptionFormInput, currency: string) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new CoreError("OPTION_NAME_REQUIRED");
  const priceMinor = parseMajorToMinor(
    input.price.trim(),
    exponentFor(currency),
  );
  if (priceMinor == null || priceMinor < 0)
    throw new CoreError("OPTION_PRICE_INVALID");
  const stock = input.stock?.trim() ? Number(input.stock) : null;
  if (stock != null && (!Number.isInteger(stock) || stock < 0))
    throw new CoreError("OPTION_STOCK_INVALID");
  const maxPerOrder = input.maxPerOrder?.trim()
    ? Number(input.maxPerOrder)
    : 10;
  if (!Number.isInteger(maxPerOrder) || maxPerOrder < 1 || maxPerOrder > 100)
    throw new CoreError("OPTION_MAX_INVALID");
  return {
    name,
    description: input.description?.trim().slice(0, 300) || null,
    priceMinor,
    stock,
    maxPerOrder,
    standalone: !!input.standalone,
  };
}

export async function createOption(
  ctx: OrgContext,
  eventId: string,
  input: OptionFormInput,
) {
  if (!hasFeature(ctx.features, "PREPAID_OPTIONS"))
    throw new CoreError("FEATURE_UNAVAILABLE");
  const event = await findEvent(ctx, eventId);
  const data = await optionData(ctx, input, event.currency);
  const sortOrder = await db.eventOption.count({ where: { eventId } });
  const option = await db.eventOption.create({
    data: { eventId, ...data, sortOrder },
  });
  await audit({
    action: "option.created",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "EventOption",
    targetId: option.id,
  });
  return option;
}

export async function updateOption(
  ctx: OrgContext,
  eventId: string,
  optionId: string,
  input: OptionFormInput,
) {
  if (!hasFeature(ctx.features, "PREPAID_OPTIONS"))
    throw new CoreError("FEATURE_UNAVAILABLE");
  const event = await findEvent(ctx, eventId);
  const data = await optionData(ctx, input, event.currency);
  const res = await db.eventOption.updateMany({
    where: { id: optionId, eventId },
    data,
  });
  if (res.count === 0) throw new CoreError("NOT_FOUND");
  await audit({
    action: "option.updated",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "EventOption",
    targetId: optionId,
  });
}

/** Activer ou retirer de la vente ; les options déjà vendues restent retirables au bar (RG-OPT-09). */
export async function setOptionActive(
  ctx: OrgContext,
  eventId: string,
  optionId: string,
  active: boolean,
) {
  await findEvent(ctx, eventId);
  const res = await db.eventOption.updateMany({
    where: { id: optionId, eventId },
    data: { active },
  });
  if (res.count === 0) throw new CoreError("NOT_FOUND");
  await audit({
    action: active ? "option.activated" : "option.deactivated",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "EventOption",
    targetId: optionId,
  });
}

/** Options de l'événement, avec les quantités vendues et retirées (RG-OPT-08). */
export async function listOptions(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  const options = await db.eventOption.findMany({
    where: { eventId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      product: {
        select: {
          variants: {
            where: { active: true },
            select: { stock: true, held: true },
          },
        },
      },
    },
  });
  const sums = await db.orderOption.groupBy({
    by: ["optionId"],
    where: {
      optionId: { in: options.map((o) => o.id) },
      order: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    },
    _sum: { quantity: true, redeemed: true },
  });
  return options.map(({ product, ...o }) => {
    const s = sums.find((x) => x.optionId === o.id)?._sum;
    // produit de la boutique : unités encore disponibles de ses variantes actives (null : au moins une sans limite)
    const shopStock = product
      ? product.variants.some((v) => v.stock == null)
        ? null
        : product.variants.reduce((n, v) => n + (variantAvailable(v) ?? 0), 0)
      : null;
    return {
      ...o,
      sold: s?.quantity ?? 0,
      redeemed: s?.redeemed ?? 0,
      shopStock,
    };
  });
}

/** Options proposées sur la page de vente : actives, seulement si l'organisation a l'offre Pro. */
export async function publicOptions(
  eventId: string,
  features: readonly string[],
  now = new Date(),
) {
  if (!features.includes("PREPAID_OPTIONS")) return [];
  const options = await db.eventOption.findMany({
    where: { eventId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      product: {
        include: {
          variants: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  const used = await db.orderOption.groupBy({
    by: ["optionId"],
    where: { optionId: { in: options.map((o) => o.id) }, order: counting(now) },
    _sum: { quantity: true },
  });
  return options.flatMap((o) => {
    // RG-SHOP-13 : produit de la boutique, proposé variante par variante (« option:variante »), au prix et au stock
    // de la boutique ; boutique fermée (offre gratuite) ou produit archivé : rien
    if (o.product) {
      if (!features.includes("SHOP") || o.product.status === "ARCHIVED")
        return [];
      const product = o.product;
      return product.variants.map((v) => ({
        id: `${o.id}:${v.id}`,
        name: optionLineName(product.name, v.label),
        description: o.description,
        priceMinor: product.priceMinor + v.priceDeltaMinor,
        maxPerOrder: o.maxPerOrder,
        left: variantAvailable(v),
        standalone: o.standalone,
      }));
    }
    const left =
      o.stock == null
        ? null
        : Math.max(
            0,
            o.stock -
              (used.find((u) => u.optionId === o.id)?._sum.quantity ?? 0),
          );
    return [
      {
        id: o.id,
        name: o.name,
        description: o.description,
        priceMinor: o.priceMinor,
        maxPerOrder: o.maxPerOrder,
        left,
        standalone: o.standalone,
      },
    ];
  });
}

/** Options en vente pour un événement, d'après l'offre de son organisateur (page de vente et aperçu). */
export async function saleOptions(eventId: string, now = new Date()) {
  const ev = await db.event.findUnique({
    where: { id: eventId },
    select: {
      organization: {
        select: { subscription: { select: PLAN_SUBSCRIPTION_SELECT } },
      },
    },
  });
  if (!ev) return [];
  const plans = await getPlans();
  return publicOptions(
    eventId,
    plans[effectivePlan(ev.organization.subscription, now)].features,
    now,
  );
}

/**
 * RG-SHOP-13 : produit de la boutique pris en option : chaque variante choisie est retenue sur le stock de la boutique,
 * de façon atomique (jamais au-delà) ; prix de la boutique, aucune commission Evoly (RG-SHOP-08).
 */
async function holdProductVariants(
  tx: Prisma.TransactionClient,
  option: {
    id: string;
    product: { id: string; name: string; priceMinor: number; status: string };
  },
  byVariant: Map<string, number> | undefined,
  quantity: number,
): Promise<PricedOptions["lines"]> {
  const chosen = [...(byVariant ?? new Map<string, number>())];
  if (!chosen.length || chosen.reduce((n, [, q]) => n + q, 0) !== quantity)
    throw new CoreError("OPTION_VARIANT_REQUIRED");
  if (option.product.status === "ARCHIVED")
    throw new CoreError("OPTION_UNAVAILABLE");
  const lines: PricedOptions["lines"] = [];
  for (const [variantId, q] of chosen) {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId: option.product.id, active: true },
    });
    if (!variant) throw new CoreError("OPTION_UNAVAILABLE");
    const held = await tx.$executeRaw`
      UPDATE "ProductVariant" SET "held" = "held" + ${q}
      WHERE id = ${variant.id} AND "active" AND ("stock" IS NULL OR "stock" - "held" >= ${q})`;
    if (held !== 1) throw new CoreError("OPTION_SOLD_OUT");
    lines.push({
      optionId: option.id,
      name: optionLineName(option.product.name, variant.label),
      quantity: q,
      unitPriceMinor: option.product.priceMinor + variant.priceDeltaMinor,
      unitFeeMinor: 0,
      productVariantId: variant.id,
      variantLabel: variant.label,
    });
  }
  return lines;
}

/** Libère les variantes de la boutique retenues par les options d'une commande (expirée, annulée). */
export async function releaseProductOptions(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const lines = await tx.orderOption.findMany({
    where: { orderId, productVariantId: { not: null } },
    select: { productVariantId: true, quantity: true },
  });
  for (const l of lines)
    await tx.$executeRaw`UPDATE "ProductVariant" SET "held" = GREATEST("held" - ${l.quantity}, 0) WHERE id = ${l.productVariantId}`;
}

/**
 * Paiement validé : les variantes retenues deviennent vendues (stock diminué) ; libérées entre-temps (réservation
 * expirée), elles sont reprises seulement si le stock le permet. Faux : plus assez de stock.
 */
export async function sellProductOptions(
  tx: Prisma.TransactionClient,
  orderId: string,
  stillHeld: boolean,
): Promise<boolean> {
  const lines = await tx.orderOption.findMany({
    where: { orderId, productVariantId: { not: null } },
    select: { productVariantId: true, quantity: true },
  });
  for (const l of lines) {
    const done = stillHeld
      ? await tx.$executeRaw`
          UPDATE "ProductVariant" SET "held" = GREATEST("held" - ${l.quantity}, 0),
            "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" - ${l.quantity} END,
            "sold" = "sold" + ${l.quantity}
          WHERE id = ${l.productVariantId} AND ("stock" IS NULL OR "stock" >= ${l.quantity})`
      : await tx.$executeRaw`
          UPDATE "ProductVariant" SET
            "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" - ${l.quantity} END,
            "sold" = "sold" + ${l.quantity}
          WHERE id = ${l.productVariantId} AND ("stock" IS NULL OR "stock" - "held" >= ${l.quantity})`;
    if (done !== 1) return false;
  }
  return true;
}

/**
 * Dans la transaction de réservation, l'événement verrouillé : options demandées, prix, commission et stock.
 * Le stock compte les commandes payées et les réservations en cours : une réservation abandonnée libère ses options d'elle-même.
 */
export async function priceOptionsInTx(
  tx: Prisma.TransactionClient,
  eventId: string,
  requested: RequestedOption[],
  terms: FeeTerms,
  now: Date,
  allowed: boolean,
  withoutTicket = false, // panier sans billet : seules les options vendables sans billet (RG-OPT-03)
): Promise<PricedOptions> {
  // quantités par option, et par variante pour un produit de la boutique (« option:variante » accepté)
  const wanted = new Map<string, number>();
  const variants = new Map<string, Map<string, number>>();
  for (const r of requested) {
    if (!Number.isInteger(r.quantity) || r.quantity < 0 || r.quantity > 100)
      throw new CoreError("OPTION_QUANTITY_INVALID");
    if (r.quantity <= 0) continue;
    const [optionId, composed] = r.optionId.split(":") as [string, string?];
    const variantId = r.variantId ?? composed ?? null;
    wanted.set(optionId, (wanted.get(optionId) ?? 0) + r.quantity);
    if (variantId) {
      const byVariant = variants.get(optionId) ?? new Map<string, number>();
      byVariant.set(variantId, (byVariant.get(variantId) ?? 0) + r.quantity);
      variants.set(optionId, byVariant);
    }
  }
  if (wanted.size === 0) return NO_OPTIONS;
  if (!allowed) throw new CoreError("FEATURE_UNAVAILABLE");
  const options = await tx.eventOption.findMany({
    where: { id: { in: [...wanted.keys()] }, eventId, active: true },
    include: { product: true },
  });
  if (options.length !== wanted.size) throw new CoreError("OPTION_UNAVAILABLE");
  if (withoutTicket && options.some((o) => !o.standalone))
    throw new CoreError("OPTION_NEEDS_TICKET");
  const lines: PricedOptions["lines"] = [];
  for (const o of options) {
    const quantity = wanted.get(o.id)!;
    if (quantity > o.maxPerOrder) throw new CoreError("OPTION_MAX_EXCEEDED");
    if (o.product) {
      lines.push(
        ...(await holdProductVariants(
          tx,
          { id: o.id, product: o.product },
          variants.get(o.id),
          quantity,
        )),
      );
      continue;
    }
    if (o.stock != null) {
      const used = await tx.orderOption.aggregate({
        where: { optionId: o.id, order: counting(now) },
        _sum: { quantity: true },
      });
      if ((used._sum.quantity ?? 0) + quantity > o.stock)
        throw new CoreError("OPTION_SOLD_OUT");
    }
    lines.push({
      optionId: o.id,
      name: o.name,
      quantity,
      unitPriceMinor: o.priceMinor,
      unitFeeMinor: optionCommission(o.priceMinor, terms),
    });
  }
  return {
    lines,
    subtotalMinor: lines.reduce((t, l) => t + l.unitPriceMinor * l.quantity, 0),
    feeMinor: lines.reduce((t, l) => t + l.unitFeeMinor * l.quantity, 0),
  };
}

/** Au bar : ce qui reste à retirer sur la commande d'un billet de l'événement (RG-OPT-04). */
export async function optionsForTicket(eventId: string, ticketId: string) {
  const ticket = await db.ticket.findFirst({
    where: { id: ticketId, eventId },
    select: { orderId: true },
  });
  if (!ticket) throw new CoreError("NOT_FOUND");
  return optionsOfOrder(ticket.orderId);
}

async function optionsOfOrder(orderId: string) {
  const lines = await db.orderOption.findMany({
    where: {
      orderId: orderId,
      order: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    },
    include: { option: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return lines.map((l) => ({
    id: l.id,
    name: optionLineName(l.option.name, l.variantLabel),
    quantity: l.quantity,
    redeemed: l.redeemed,
    refunded: l.refunded,
    left: l.quantity - l.redeemed - l.refunded,
  }));
}

/** Au bar, à partir du QR code ou du code court scanné, avec les mêmes règles qu'à l'entrée : un billet de cet événement seulement. */
export async function optionsForScan(
  eventId: string,
  input: { code?: string; shortCode?: string },
) {
  const select = {
    id: true,
    eventId: true,
    holderFirstName: true,
    holderLastName: true,
  } as const;
  const ticket = input.code
    ? await db.ticket.findUnique({ where: { code: input.code.trim() }, select })
    : input.shortCode
      ? await db.ticket.findUnique({
          where: {
            eventId_shortCode: {
              eventId,
              shortCode: normalizeShortCode(input.shortCode),
            },
          },
          select,
        })
      : null;
  if (!ticket || ticket.eventId !== eventId) {
    // options achetées sans billet : la commande retrouvée par son code de retrait, dans cet événement seulement (RG-OPT-03)
    const pass = {
      id: true,
      eventId: true,
      buyerFirstName: true,
      buyerLastName: true,
    } as const;
    const order = input.code
      ? await db.order.findUnique({
          where: { optionsCode: input.code.trim() },
          select: pass,
        })
      : input.shortCode
        ? await db.order.findUnique({
            where: { optionsShortCode: normalizeShortCode(input.shortCode) },
            select: pass,
          })
        : null;
    if (!order || order.eventId !== eventId) throw new CoreError("NOT_FOUND");
    return {
      holder: `${order.buyerFirstName} ${order.buyerLastName}`.trim() || null,
      options: await optionsOfOrder(order.id),
    };
  }
  const holder =
    [ticket.holderFirstName, ticket.holderLastName].filter(Boolean).join(" ") ||
    null;
  return { holder, options: await optionsForTicket(eventId, ticket.id) };
}

/** Retrait au bar, atomique : jamais au-delà de ce qui a été acheté, même avec deux téléphones à la fois ; chaque retrait est journalisé. */
export async function redeemOption(
  eventId: string,
  orderOptionId: string,
  quantity: number,
  by: { deviceId?: string | null; staffName?: string | null } = {},
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
    throw new CoreError("OPTION_QUANTITY_INVALID");
  return db.$transaction(async (tx) => {
    const done = await tx.$executeRaw`
      UPDATE "OrderOption" AS l SET "redeemed" = l."redeemed" + ${quantity}
      FROM "Order" AS o
      WHERE l."id" = ${orderOptionId} AND o."id" = l."orderId" AND o."eventId" = ${eventId}
        AND o."status" IN ('PAID', 'PARTIALLY_REFUNDED') AND l."redeemed" + l."refunded" + ${quantity} <= l."quantity"`;
    if (done !== 1) throw new CoreError("OPTION_NOT_REDEEMABLE");
    await tx.optionRedemption.create({
      data: {
        orderOptionId,
        quantity,
        deviceId: by.deviceId ?? null,
        staffName: by.staffName?.slice(0, 80) ?? null,
      },
    });
    const line = await tx.orderOption.findUniqueOrThrow({
      where: { id: orderOptionId },
      select: { quantity: true, redeemed: true, refunded: true },
    });
    return { left: line.quantity - line.redeemed - line.refunded };
  });
}

/** RG-OPT-07 : les options non retirées restent remboursables après le début de l'événement, si l'organisateur le décide. */
export async function setOptionsRefundAfterStart(
  ctx: OrgContext,
  eventId: string,
  allowed: boolean,
) {
  if (!hasFeature(ctx.features, "PREPAID_OPTIONS"))
    throw new CoreError("FEATURE_UNAVAILABLE");
  await findEvent(ctx, eventId);
  await db.event.update({
    where: { id: eventId },
    data: { optionsRefundAfterStart: allowed },
  });
}

export type OfflineRedemption = {
  clientId: string;
  orderOptionId: string;
  quantity: number;
  at: string;
  deviceId?: string | null;
  staffName?: string | null;
};

/**
 * RG-OPT-05 : retraits faits sans réseau, rejoués dans l'ordre où ils ont eu lieu. Chacun retire seulement ce qui reste
 * (ni retiré, ni remboursé) ; le surplus est refusé et enregistré comme conflit, signalé à l'organisateur dans les entrées.
 * Un retrait qui ne concerne pas cet événement est ignoré.
 */
export async function syncOptionRedemptions(
  eventId: string,
  items: OfflineRedemption[],
  now = new Date(),
) {
  const ordered = [...items].sort((a, b) => a.at.localeCompare(b.at));
  const results: Array<{
    clientId: string;
    redeemed: number;
    refused: number;
    left: number;
  }> = [];
  for (const it of ordered) {
    const q = Math.max(1, Math.min(20, Math.trunc(it.quantity)));
    const at = new Date(it.at);
    const when = Number.isFinite(at.getTime()) && at <= now ? at : now;
    const by = {
      deviceId: it.deviceId ?? null,
      staffName: it.staffName?.slice(0, 80) ?? null,
    };
    results.push({
      clientId: it.clientId,
      ...(await db.$transaction(async (tx) => {
        const line = await tx.orderOption.findFirst({
          where: {
            id: it.orderOptionId,
            order: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
          },
          select: { quantity: true, redeemed: true, refunded: true },
        });
        if (!line) return { redeemed: 0, refused: q, left: 0 };
        const ok = Math.max(
          0,
          Math.min(q, line.quantity - line.redeemed - line.refunded),
        );
        if (ok > 0) {
          const done =
            await tx.$executeRaw`UPDATE "OrderOption" SET "redeemed" = "redeemed" + ${ok} WHERE id = ${it.orderOptionId} AND "redeemed" + "refunded" + ${ok} <= "quantity"`;
          if (done !== 1) throw new CoreError("OPTION_NOT_REDEEMABLE");
          await tx.optionRedemption.create({
            data: {
              orderOptionId: it.orderOptionId,
              quantity: ok,
              ...by,
              offline: true,
              createdAt: when,
            },
          });
        }
        if (q > ok)
          await tx.optionRedemptionConflict.create({
            data: {
              orderOptionId: it.orderOptionId,
              requested: q,
              refused: q - ok,
              ...by,
              happenedAt: when,
            },
          });
        return {
          redeemed: ok,
          refused: q - ok,
          left: line.quantity - line.redeemed - line.refunded - ok,
        };
      })),
    });
  }
  return results;
}

/** Retraits en double signalés à l'organisateur (RG-OPT-05), du plus récent au plus ancien. */
export async function optionConflicts(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  return db.optionRedemptionConflict.findMany({
    where: { line: { order: { eventId } } },
    select: {
      id: true,
      requested: true,
      refused: true,
      deviceId: true,
      staffName: true,
      happenedAt: true,
      line: {
        select: {
          option: { select: { name: true } },
          order: { select: { reference: true } },
        },
      },
    },
    orderBy: { happenedAt: "desc" },
    take: 200,
  });
}
