"use server";

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
