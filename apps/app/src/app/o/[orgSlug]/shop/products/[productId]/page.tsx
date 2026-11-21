import {
  can,
  combinations,
  hasFeature,
  minorToInput,
  vatRateInput,
} from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getProductForEdit } from "@/server/shop";
import { exponentFor } from "@/server/events";
import { currencySymbol } from "../../money";
import {
  DeleteProduct,
  ProductImages,
  ProductInfoForm,
  ProductOptionsEditor,
  ProductStatusForm,
  VariantsForm,
} from "./ProductEditor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; productId: string }>;
}): Promise<Metadata> {
  const { orgSlug, productId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const product = hasFeature(ctx.features, "SHOP")
    ? await getProductForEdit(ctx, productId).catch(() => null)
    : null;
  return { title: product?.name ?? (await getTranslations("nav"))("shop") };
}

/**
 * Fiche d'un produit de la boutique (US-SHOP-01, US-SHOP-02) : statut, informations, photos, options, stock et
 * supplément de chaque variante, suppression d'un produit jamais vendu.
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ orgSlug: string; productId: string }>;
}) {
  const { orgSlug, productId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "SHOP_MANAGE") || !hasFeature(ctx.features, "SHOP"))
    notFound();
  const product = await getProductForEdit(ctx, productId).catch(() => null);
  if (!product) notFound();
  const locale = (await getLocale()) as Locale;
  const exponent = exponentFor(product.currency);
  const money = (v: number) =>
    formatMoney(v, product.currency, locale, { trimZeroCents: true });
  const readOnly = ctx.readOnly;
  // variantes des combinaisons actuelles ; celles d'anciennes combinaisons déjà vendues restent dans les commandes
  const current = new Set(combinations(product.optionGroups).map((c) => c.key));
  const variants = product.variants.filter((v) => current.has(v.key));
  const sold = product.variants.some((v) => v.sold > 0 || v.held > 0);
  const symbol = currencySymbol(product.currency);
  return (
    <div className="grid">
      <ProductStatusForm
        orgSlug={ctx.organization.slug}
        productId={product.id}
        status={product.status}
        readOnly={readOnly}
      />
      <ProductInfoForm
        orgSlug={ctx.organization.slug}
        productId={product.id}
        symbol={symbol}
        readOnly={readOnly}
        info={{
          name: product.name,
          description: product.description ?? "",
          price: minorToInput(product.priceMinor, exponent),
          vatRate: vatRateInput(product.vatRateBps),
          pickupEnabled: product.pickupEnabled,
          shippingEnabled: product.shippingEnabled,
          featured: product.featured,
        }}
      />
      <ProductImages
        orgSlug={ctx.organization.slug}
        productId={product.id}
        name={product.name}
        readOnly={readOnly}
        images={product.images.map((i) => ({
          id: i.id,
          url: i.url,
          alt: i.alt ?? "",
        }))}
      />
      <ProductOptionsEditor
        // après l'enregistrement, l'éditeur repart des options enregistrées (nouvelles options et valeurs identifiées)
        key={product.optionGroups
          .map(
            (g) =>
              `${g.id}:${g.name}:${g.values.map((v) => `${v.id}=${v.name}`).join(",")}`,
          )
          .join("|")}
        orgSlug={ctx.organization.slug}
        productId={product.id}
        readOnly={readOnly}
        groups={product.optionGroups.map((g) => ({
          id: g.id,
          name: g.name,
          values: g.values.map((v) => ({ id: v.id, name: v.name })),
        }))}
      />
      <VariantsForm
        key={variants
          .map((v) => `${v.id}:${v.stock}:${v.priceDeltaMinor}:${v.active}`)
          .join("|")}
        orgSlug={ctx.organization.slug}
        productId={product.id}
        symbol={symbol}
        readOnly={readOnly}
        variants={variants.map((v) => ({
          id: v.id,
          label: v.label,
          price: money(product.priceMinor + v.priceDeltaMinor),
          delta: v.priceDeltaMinor
            ? minorToInput(v.priceDeltaMinor, exponent)
            : "",
          stock: v.stock == null ? "" : String(v.stock),
          held: v.held,
          sold: v.sold,
          active: v.active,
        }))}
      />
      {readOnly ? null : (
        <DeleteProduct
          orgSlug={ctx.organization.slug}
          productId={product.id}
          name={product.name}
          sold={sold}
        />
      )}
    </div>
  );
}
