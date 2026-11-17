import { can, hasFeature, minorToInput, vatRateInput } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ProLocked } from "@/components/ProLocked";
import { ButtonTabs } from "@/components/ui/ButtonTabs";
import { listShopOrders, type ShopOrderFilter } from "@/server/shopOrders";
import { ShopOrdersTable } from "./ShopOrdersTable";
import { requireOrgContext } from "@/server/context";
import { defaultVatRateBps, listProducts } from "@/server/shop";
import { listPickupPoints, listShippingMethods } from "@/server/shopDelivery";
import { DeliveryView } from "./DeliveryView";
import { ProductsTable, ShopPreview } from "./ProductsTable";
import { currencySymbol } from "./money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("shop") };
}

/**
 * Boutique (lot 3, Pro), section 9.35 : onglets Produits (par défaut), Commandes (?tab=orders, filtrées par état) et
 * Retrait et livraison (?tab=delivery). En offre gratuite : l'encart Pro, avec un aperçu.
 */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ tab?: string; state?: string }>;
}) {
  const { orgSlug } = await params;
  const { tab, state } = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  // le catalogue pour qui gère la boutique ; les commandes pour qui voit les commandes (billetterie comprise)
  const catalog = can(ctx.membership, "SHOP_MANAGE");
  const orders = can(ctx.membership, "ORDERS_VIEW");
  if (!catalog && !orders) notFound();
  const t = await getTranslations("shop");
  if (!hasFeature(ctx.features, "SHOP"))
    return (
      <div className="grid gap-3.5">
        <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
        <ProLocked
          orgSlug={orgSlug}
          feature="SHOP"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
          preview={<ShopPreview />}
        />
      </div>
    );
  const locale = (await getLocale()) as Locale;
  const currency = ctx.organization.currency;
  const money = (v: number) =>
    formatMoney(v, currency, locale, { trimZeroCents: true });
  const canManage = !ctx.readOnly;
  if (tab === "orders" || !catalog) {
    if (!orders) notFound();
    const filter = (
      ["TO_PREPARE", "READY", "DONE", "ALL"].includes(state ?? "")
        ? state
        : "TO_PREPARE"
    ) as ShopOrderFilter;
    const [rows, tl] = await Promise.all([
      listShopOrders(ctx, filter),
      getTranslations("shopOrders"),
    ]);
    const base = `/o/${ctx.organization.slug}/shop?tab=orders`;
    return (
      <div className="grid gap-3.5">
        <ButtonTabs
          label={tl("filters")}
          current={`${base}&state=${filter}`}
          items={(["TO_PREPARE", "READY", "DONE", "ALL"] as const).map((f) => ({
            href: `${base}&state=${f}`,
            label: tl(`filter_${f}`),
          }))}
        />
        <ShopOrdersTable
          rows={rows.map((o) => ({
            id: o.id,
            reference: o.reference,
            buyer: o.buyer,
            email: o.email,
            items: o.items,
            total: money(o.totalMinor),
            totalMinor: o.totalMinor,
            status: o.status,
            fulfillmentStatus: o.fulfillmentStatus,
            withdrawal: o.withdrawal,
            date: formatDateTime(
              o.createdAt,
              ctx.organization.timezone,
              locale,
              "short",
            ),
            dateAt: o.createdAt.getTime(),
            href: `/o/${ctx.organization.slug}/shop/orders/${o.id}`,
          }))}
        />
      </div>
    );
  }
  if (!catalog) notFound();
  if (tab === "delivery") {
    const [points, methods] = await Promise.all([
      listPickupPoints(ctx),
      listShippingMethods(ctx),
    ]);
    return (
      <DeliveryView
        orgSlug={ctx.organization.slug}
        canManage={canManage}
        symbol={currencySymbol(currency)}
        points={points.map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          instructions: p.instructions ?? "",
          active: p.active,
        }))}
        methods={methods.map((m) => ({
          id: m.id,
          name: m.name,
          price: m.priceMinor === 0 ? t("shippingFree") : money(m.priceMinor),
          priceMinor: m.priceMinor,
          priceInput: minorToInput(m.priceMinor),
          active: m.active,
        }))}
      />
    );
  }
  const products = await listProducts(ctx);
  return (
    <div className="grid gap-3.5">
      <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
      <ProductsTable
        orgSlug={ctx.organization.slug}
        canManage={canManage}
        symbol={currencySymbol(currency)}
        defaultVat={vatRateInput(defaultVatRateBps(ctx.organization.country))}
        rows={products.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          featured: p.featured,
          imageUrl: p.imageUrl,
          price:
            p.priceMinMinor === p.priceMaxMinor
              ? money(p.priceMinMinor)
              : t("priceFrom", { price: money(p.priceMinMinor) }),
          priceSort: p.priceMinMinor,
          stock: p.stock,
          sold: p.sold,
          variants: p.variants,
          href: `/o/${ctx.organization.slug}/shop/products/${p.id}`,
        }))}
      />
    </div>
  );
}
