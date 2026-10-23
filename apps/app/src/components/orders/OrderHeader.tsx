import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ResendTickets } from "@/app/o/[orgSlug]/orders/[orderId]/OrderActions";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { getOrderDetail } from "@/server/ordersAdmin";

/** En-tête d'une commande, comme celui d'un événement : acheteur, statut, informations, onglets, renvoi des billets. */
export async function OrderHeader({
  orgSlug,
  orderId,
}: {
  orgSlug: string;
  orderId: string;
}) {
  const ctx = await requireOrgContext(orgSlug);
  const order = await getOrderDetail(ctx, orderId).catch(() => null);
  if (!order) return null;
  const t = await getTranslations("ordersAdmin");
  const nav = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const org = `/o/${ctx.organization.slug}`;
  const base = `${org}/orders/${order.id}`;
  const count = (label: string, n: number) => (n ? `${label} (${n})` : label);
  return (
    <PageHeader
      eyebrow={
        <p className="text-xs text-ink-muted">
          <Link href={`${org}/orders`} className="hover:text-ink">
            {nav("orders")}
          </Link>{" "}
          / <span className="font-mono">{order.reference}</span>
        </p>
      }
      title={`${order.buyerFirstName} ${order.buyerLastName}`}
      badge={
        <Badge
          tone={
            order.status === "PAID"
              ? "success"
              : order.status === "PARTIALLY_REFUNDED"
                ? "warning"
                : "neutral"
          }
        >
          {t(
            order.status === "PAID" && order.totalMinor === 0
              ? "status_CONFIRMED"
              : `status_${order.status}`,
          )}
        </Badge>
      }
      meta={
        <p className="text-[0.8125rem] text-ink-muted">
          {order.event.title} ·{" "}
          {formatDateTime(
            order.createdAt,
            order.event.timezone,
            locale,
            "short",
          )}{" "}
          · {formatMoney(order.totalMinor, order.currency, locale)}
          {order.source === "RESALE"
            ? ` · ${t("fromResale")}`
            : order.source === "COMPLIMENTARY"
              ? ` · ${t("fromComplimentary")}`
              : ""}
        </p>
      }
      actions={
        order.status === "PAID" || order.status === "PARTIALLY_REFUNDED" ? (
          <ResendTickets orgSlug={ctx.organization.slug} orderId={order.id} />
        ) : null
      }
      tabsLabel={t("tabsLabel")}
      tabs={[
        { label: count(t("tab_tickets"), order.tickets.length), href: base },
        { label: t("tab_buyer"), href: `${base}?tab=buyer` },
        {
          label: count(t("tab_payment"), order.refunds.length),
          href: `${base}?tab=payment`,
        },
        ...(order.options.length
          ? [
              {
                label: count(t("tab_options"), order.options.length),
                href: `${base}?tab=options`,
              },
            ]
          : []),
        {
          label: count(t("tab_emails"), order.emailMessages.length),
          href: `${base}?tab=emails`,
        },
      ]}
    />
  );
}
