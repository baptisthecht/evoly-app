import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import { hasFeature } from "@evoly/core";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  FulfillmentBadge,
  PaymentBadge,
} from "@/app/o/[orgSlug]/shop/ShopOrdersTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { getShopOrder } from "@/server/shopOrders";

/** Une commande de la boutique : fil « Boutique / Commandes », acheteur, états, référence, date et total. */
export default async function Header({
  params,
}: {
  params: Promise<{ orgSlug: string; orderId: string }>;
}) {
  const { orgSlug, orderId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!hasFeature(ctx.features, "SHOP")) return null;
  const order = await getShopOrder(ctx, orderId).catch(() => null);
  if (!order) return null;
  const nav = await getTranslations("nav");
  const s = await getTranslations("sections");
  const t = await getTranslations("shopOrders");
  const locale = (await getLocale()) as Locale;
  const base = `/o/${ctx.organization.slug}/shop`;
  return (
    <PageHeader
      eyebrow={
        <p className="text-[12.5px] text-ink-muted">
          <Link href={base} className="hover:text-ink">
            {nav("shop")}
          </Link>{" "}
          /{" "}
          <Link href={`${base}?tab=orders`} className="hover:text-ink">
            {s("tab_shopOrders")}
          </Link>{" "}
          / <span className="tabular-nums">{order.reference}</span>
        </p>
      }
      title={
        [order.buyerFirstName, order.buyerLastName].filter(Boolean).join(" ") ||
        order.reference
      }
      badge={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <FulfillmentBadge status={order.fulfillmentStatus} />
          <PaymentBadge status={order.status} />
          {order.withdrawalRequestedAt ? (
            <Badge tone="danger">{t("withdrawalBadge")}</Badge>
          ) : null}
        </span>
      }
      meta={
        <p className="text-[13px] text-ink-muted">
          {formatDateTime(
            order.createdAt,
            ctx.organization.timezone,
            locale,
            "short",
          )}{" "}
          · {formatMoney(order.totalMinor, order.currency, locale)}
        </p>
      }
    />
  );
}
