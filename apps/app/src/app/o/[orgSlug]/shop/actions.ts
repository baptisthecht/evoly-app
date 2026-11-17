"use server";

import { can, CoreError } from "@evoly/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formToObject, runOrgAction, type ActionState } from "@/server/guard";
import {
  addProductImage,
  createProduct,
  deleteProduct,
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
  setPickupPointActive,
  setShippingMethodActive,
  updatePickupPoint,
  updateShippingMethod,
} from "@/server/shopDelivery";
import {
  findShopOrderByPickupCode,
  markShopOrderPickedUp,
  markShopOrderReady,
  markShopOrderShipped,
  refundShopOrder,
} from "@/server/shopOrders";

// Boutique (lot 3, Pro), section 9.35 : droit « Gérer la boutique », fonctionnalité SHOP
const SHOP = { permission: "SHOP_MANAGE", feature: "SHOP" } as const;

const text = (max: number) =>
  z.string().trim().max(max, { message: "validation.textLength" });
const required = (max: number) =>
  text(max).min(1, { message: "validation.required" });
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().trim().max(max, { message: "validation.textLength" }).nullable(),
  );
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

const shopPath = (orgSlug: string) => `/o/${orgSlug}/shop`;
const productPath = (orgSlug: string, productId: string) =>
  `/o/${orgSlug}/shop/products/${productId}`;

const productSchema = z.object({
  name: required(80),
  description: optionalText(2000),
  price: required(12),
  vatRate: required(8),
  pickupEnabled: checkbox,
  shippingEnabled: checkbox,
  featured: checkbox,
});

/** « Nouveau produit » (fenêtre) : créé en brouillon, puis sa fiche s'ouvre (photos, options, stock). */
export async function createProductAction(
  orgSlug: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    {
      schema: productSchema.extend({ stock: optionalText(9) }),
      ...SHOP,
    },
    async (d, ctx) => (await createProduct(ctx, d)).id,
  );
  if (!r?.ok) return r;
  revalidatePath(shopPath(orgSlug));
  redirect(productPath(orgSlug, r.data));
}

export async function updateProductAction(
  orgSlug: string,
  productId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: productSchema, ...SHOP },
    async (d, ctx) => {
      await updateProduct(ctx, productId, d);
      return null;
    },
  );
  if (r?.ok) revalidatePath(productPath(orgSlug, productId));
  return r;
}

const statusSchema = z.object({
  status: z.enum(["DRAFT", "ON_SALE", "ARCHIVED"]),
});

export async function productStatusAction(
  orgSlug: string,
  productId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: statusSchema, ...SHOP },
    async (d, ctx) => {
      await setProductStatus(ctx, productId, d.status);
      return null;
    },
  );
  if (r?.ok) {
    revalidatePath(productPath(orgSlug, productId));
    revalidatePath(shopPath(orgSlug));
  }
  return r;
}

export async function productFeaturedAction(
  orgSlug: string,
  productId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: z.object({ featured: checkbox }), ...SHOP },
    async (d, ctx) => {
      await setProductFeatured(ctx, productId, d.featured);
      return null;
    },
  );
  if (r?.ok) revalidatePath(shopPath(orgSlug));
  return r;
}

export async function deleteProductAction(
  orgSlug: string,
  productId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: z.object({}), ...SHOP },
    async (_d, ctx) => {
      await deleteProduct(ctx, productId);
      return null;
    },
  );
  if (!r?.ok) return r;
  revalidatePath(shopPath(orgSlug));
  redirect(shopPath(orgSlug));
}

// options : la liste complète, en JSON (noms et identifiants des options et des valeurs existantes)
const optionsSchema = z.object({
  groups: z.preprocess(
    (v) => {
      try {
        return JSON.parse(String(v));
      } catch {
        return null;
      }
    },
    z
      .array(
        z.object({
          id: z.string().max(40).optional(),
          name: z.string().max(80),
          values: z
            .array(
              z.object({
                id: z.string().max(40).optional(),
                name: z.string().max(80),
              }),
            )
            .max(50),
        }),
      )
      .max(10),
  ),
});

export async function saveOptionsAction(
  orgSlug: string,
  productId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: optionsSchema, ...SHOP },
    async (d, ctx) => {
      await saveProductOptions(ctx, productId, d.groups);
      return null;
    },
  );
  if (r?.ok) revalidatePath(productPath(orgSlug, productId));
  return r;
}

// variantes : « ids » (identifiants séparés par des virgules, 100 variantes au plus), puis « stock.<id> »,
// « delta.<id> » et « active.<id> » (case cochée) pour chacune
const variantsSchema = z
  .object({ ids: z.string().max(4000) })
  .catchall(z.string().max(20));

export async function saveVariantsAction(
  orgSlug: string,
  productId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: variantsSchema, ...SHOP },
    async (d, ctx) => {
      const ids = d.ids.split(",").filter(Boolean).slice(0, 100);
      await saveVariants(
        ctx,
        productId,
        ids.map((id) => ({
          id,
          stock: String(d[`stock.${id}`] ?? ""),
          priceDelta: String(d[`delta.${id}`] ?? ""),
          active: d[`active.${id}`] === "on",
        })),
      );
      return null;
    },
  );
  if (r?.ok) revalidatePath(productPath(orgSlug, productId));
  return r;
}

/** Photo importée (route d'import) puis ajoutée à la galerie. */
export async function addImageAction(
  orgSlug: string,
  productId: string,
  url: string,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    { url },
    { schema: z.object({ url: z.string().url().max(500) }), ...SHOP },
    async (d, ctx) => {
      await addProductImage(ctx, productId, d.url);
      return null;
    },
  );
  if (r?.ok) revalidatePath(productPath(orgSlug, productId));
  return r;
}

const imageSchema = z.object({
  command: z.enum(["first", "up", "down", "remove", "alt"]),
  alt: optionalText(200),
});

export async function imageCommandAction(
  orgSlug: string,
  productId: string,
  imageId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: imageSchema, ...SHOP },
    async (d, ctx) => {
      if (d.command === "remove")
        await removeProductImage(ctx, productId, imageId);
      else if (d.command === "alt")
        await setProductImageAlt(ctx, productId, imageId, d.alt ?? "");
      else await moveProductImage(ctx, productId, imageId, d.command);
      return null;
    },
  );
  if (r?.ok) revalidatePath(productPath(orgSlug, productId));
  return r;
}

// Retrait et livraison
const pointSchema = z.object({
  name: required(80),
  address: required(300),
  instructions: optionalText(500),
});

export async function savePickupPointAction(
  orgSlug: string,
  pointId: string | null,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: pointSchema, ...SHOP },
    async (d, ctx) => {
      if (pointId) await updatePickupPoint(ctx, pointId, d);
      else await createPickupPoint(ctx, d);
      return null;
    },
  );
  if (r?.ok) revalidatePath(shopPath(orgSlug));
  return r;
}

const methodSchema = z.object({ name: required(80), price: required(12) });

export async function saveShippingMethodAction(
  orgSlug: string,
  methodId: string | null,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: methodSchema, ...SHOP },
    async (d, ctx) => {
      if (methodId) await updateShippingMethod(ctx, methodId, d);
      else await createShippingMethod(ctx, d);
      return null;
    },
  );
  if (r?.ok) revalidatePath(shopPath(orgSlug));
  return r;
}

const deliveryCommand = z.object({
  command: z.enum(["enable", "disable", "delete"]),
});

/** Lieu de retrait ou mode de livraison : proposé, mis de côté, ou supprimé. */
export async function deliveryCommandAction(
  orgSlug: string,
  kind: "pickup" | "shipping",
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: deliveryCommand, ...SHOP },
    async (d, ctx) => {
      if (kind === "pickup") {
        if (d.command === "delete") await deletePickupPoint(ctx, id);
        else await setPickupPointActive(ctx, id, d.command === "enable");
      } else if (d.command === "delete") await deleteShippingMethod(ctx, id);
      else await setShippingMethodActive(ctx, id, d.command === "enable");
      return null;
    },
  );
  if (r?.ok) revalidatePath(shopPath(orgSlug));
  return r;
}

// Commandes de la boutique (lot 3b) : préparation, retrait, remboursement (droits des commandes)
const orderPath = (orgSlug: string, orderId: string) =>
  `/o/${orgSlug}/shop/orders/${orderId}`;

/** « Prête à retirer » (e-mail à l'acheteur) ou « Retirée » (remise en main propre). */
export async function fulfillmentAction(
  orgSlug: string,
  orderId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    {
      schema: z.object({ step: z.enum(["READY", "PICKED_UP"]) }),
      permission: "ORDERS_MANAGE",
      feature: "SHOP",
    },
    async (d, ctx) => {
      if (d.step === "READY") await markShopOrderReady(ctx, orderId);
      else await markShopOrderPickedUp(ctx, orderId);
      return null;
    },
  );
  if (r?.ok) {
    revalidatePath(orderPath(orgSlug, orderId));
    revalidatePath(shopPath(orgSlug));
  }
  return r;
}

const refundSchema = z
  .object({ restock: checkbox, shipping: checkbox })
  .catchall(z.string().max(4));

/** Remboursement ligne par ligne (champs « qty.<ligne> »), articles remis en stock si demandé. */
export async function refundShopOrderAction(
  orgSlug: string,
  orderId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: refundSchema, permission: "REFUNDS_MANAGE", feature: "SHOP" },
    async (d, ctx) => {
      const lines = Object.entries(d)
        .filter(([k]) => k.startsWith("qty."))
        .map(([k, v]) => ({ lineId: k.slice(4), quantity: Number(v) || 0 }));
      return refundShopOrder(ctx, orderId, {
        lines,
        restock: d.restock,
        shipping: d.shipping,
      });
    },
  );
  if (r?.ok) {
    revalidatePath(orderPath(orgSlug, orderId));
    revalidatePath(shopPath(orgSlug));
  }
  return r;
}

const shipSchema = z.object({
  carrier: required(60),
  trackingNumber: required(80),
  trackingUrl: required(500),
});

/** Expédition (RG-SHOP-15) : transporteur, numéro et lien de suivi, envoyés à l'acheteur par e-mail. */
export async function shipOrderAction(
  orgSlug: string,
  orderId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: shipSchema, permission: "ORDERS_MANAGE", feature: "SHOP" },
    async (d, ctx) => {
      await markShopOrderShipped(ctx, orderId, d);
      return null;
    },
  );
  if (r?.ok) {
    revalidatePath(orderPath(orgSlug, orderId));
    revalidatePath(shopPath(orgSlug));
  }
  return r;
}

export interface PickupLookup {
  id: string;
  reference: string;
  buyer: string;
  status: string;
  fulfillmentStatus: string;
  withdrawal: boolean;
  lines: Array<{ name: string; quantity: number; refunded: number }>;
}

/** Retrait : la commande d'un code QR scanné ou saisi (droit de gérer les commandes ou de scanner). */
export async function pickupLookupAction(
  orgSlug: string,
  code: string,
): Promise<ActionState<PickupLookup>> {
  return runOrgAction(
    orgSlug,
    { code },
    {
      schema: z.object({ code: z.string().trim().min(1).max(40) }),
      feature: "SHOP",
      write: false,
    },
    async (d, ctx) => {
      if (
        !can(ctx.membership, "ORDERS_MANAGE") &&
        !can(ctx.membership, "CHECKIN_SCAN")
      )
        throw new CoreError("FORBIDDEN");
      const o = await findShopOrderByPickupCode(ctx, d.code);
      return {
        id: o.id,
        reference: o.reference,
        buyer: [o.buyerFirstName, o.buyerLastName].filter(Boolean).join(" "),
        status: o.status,
        fulfillmentStatus: o.fulfillmentStatus,
        withdrawal: !!o.withdrawalRequestedAt,
        lines: o.lines.map((l) => ({
          name: l.variantLabel
            ? `${l.productName} (${l.variantLabel})`
            : l.productName,
          quantity: l.quantity,
          refunded: l.refundedQuantity,
        })),
      };
    },
  );
}

/** Retrait confirmé depuis la page de scan. */
export async function pickupConfirmAction(
  orgSlug: string,
  orderId: string,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    { orderId },
    { schema: z.object({ orderId: z.string().max(40) }), feature: "SHOP" },
    async (d, ctx) => {
      if (
        !can(ctx.membership, "ORDERS_MANAGE") &&
        !can(ctx.membership, "CHECKIN_SCAN")
      )
        throw new CoreError("FORBIDDEN");
      await markShopOrderPickedUp(ctx, d.orderId);
      return null;
    },
  );
  if (r?.ok) revalidatePath(shopPath(orgSlug));
  return r;
}
