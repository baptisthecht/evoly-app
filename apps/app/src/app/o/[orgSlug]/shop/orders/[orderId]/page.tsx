import { can, formatVatRate, hasFeature, shopOrderTotals } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { SettingsRow } from "@/components/ui/Controls";
import { requireOrgContext } from "@/server/context";
import { getShopOrder } from "@/server/shopOrders";
import { FulfillmentButtons, RefundForm } from "./OrderDetail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("shopOrders"))("orderTitle") };
}

/**
 * Fiche d'une commande de la boutique (US-SHOP-06) : préparation et retrait, articles avec leur TVA, acheteur,
 * paiement (frais de Stripe, aucune commission Evoly), remboursements, rétractation demandée.
 */
export default async function ShopOrderPage({
  params,
}: {
  params: Promise<{ orgSlug: string; orderId: string }>;
}) {
  const { orgSlug, orderId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "ORDERS_VIEW") || !hasFeature(ctx.features, "SHOP"))
    notFound();
  const order = await getShopOrder(ctx, orderId).catch(() => null);
  if (!order) notFound();
  const t = await getTranslations("shopOrders");
  const locale = (await getLocale()) as Locale;
  const tz = ctx.organization.timezone;
  const money = (v: number) => formatMoney(v, order.currency, locale);
  const totals = shopOrderTotals(order.lines, null);
  const when = (d: Date | null) =>
    d ? formatDateTime(d, tz, locale, "short") : null;
  return (
    <div className="grid">
      {order.withdrawalRequestedAt ? (
        <p
          role="status"
          className="mt-4 rounded-[10px] bg-danger-soft px-3.5 py-3 text-[14px] text-danger"
        >
          {t("withdrawalRequested", {
            date: when(order.withdrawalRequestedAt)!,
          })}
        </p>
      ) : null}
      <SettingsRow
        title={t("fulfillmentTitle")}
        description={t(`fulfillment_${order.fulfillmentStatus}`)}
      >
        {order.fulfillmentMode === "PICKUP" && order.pickupName ? (
          <p className="text-[14px] whitespace-pre-line">
            <strong>{order.pickupName}</strong>
            {"\n"}
            {order.pickupAddress}
            {order.pickupInstructions ? `\n${order.pickupInstructions}` : ""}
          </p>
        ) : null}
        <ul className="grid gap-1 text-[13px] text-ink-muted">
          {[
            [t("paidAt"), when(order.paidAt)],
            [t("readyAt"), when(order.readyAt)],
            [t("pickedUpAt"), when(order.pickedUpAt)],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <li key={k}>
                {k} : {v}
              </li>
            ))}
        </ul>
        <FulfillmentButtons
          orgSlug={ctx.organization.slug}
          orderId={order.id}
          status={order.fulfillmentStatus}
          canManage={
            can(ctx.membership, "ORDERS_MANAGE") &&
            !ctx.readOnly &&
            order.status !== "REFUNDED"
          }
        />
      </SettingsRow>
      <SettingsRow title={t("itemsTitle")} description={t("itemsHint")}>
        <ul className="grid gap-2">
          {order.lines.map((l) => (
            <li
              key={l.id}
              className="flex items-baseline justify-between gap-3 text-[14px]"
            >
              <span>
                {l.quantity} × {l.productName}
                {l.variantLabel ? (
                  <span className="text-ink-muted"> ({l.variantLabel})</span>
                ) : null}
                <small className="block text-[12.5px] text-ink-muted">
                  {t("vatRate", { rate: formatVatRate(l.vatRateBps, locale) })}
                  {l.refundedQuantity
                    ? ` · ${t("refundedQuantity", { count: l.refundedQuantity })}`
                    : ""}
                </small>
              </span>
              <span className="tabular-nums">
                {money(l.unitPriceMinor * l.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <div className="grid gap-1 border-t border-line pt-3 text-[14px]">
          <p className="flex justify-between font-semibold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{money(order.totalMinor)}</span>
          </p>
          {totals.vat.map((v) => (
            <p
              key={v.rateBps}
              className="flex justify-between text-[13px] text-ink-muted"
            >
              <span>
                {t("vatIncluded", { rate: formatVatRate(v.rateBps, locale) })}
              </span>
              <span className="tabular-nums">{money(v.vatMinor)}</span>
            </p>
          ))}
        </div>
      </SettingsRow>
      <SettingsRow title={t("buyerTitle")}>
        <ul className="grid gap-1 text-[14px]">
          <li>
            {[order.buyerFirstName, order.buyerLastName]
              .filter(Boolean)
              .join(" ")}
          </li>
          {order.buyerEmail ? (
            <li>
              <a
                href={`mailto:${order.buyerEmail}`}
                className="underline underline-offset-[3px]"
              >
                {order.buyerEmail}
              </a>
            </li>
          ) : null}
          {order.buyerPhone ? <li>{order.buyerPhone}</li> : null}
        </ul>
      </SettingsRow>
      <SettingsRow title={t("paymentTitle")} description={t("paymentHint")}>
        <ul className="grid gap-1 text-[14px]">
          <li className="flex justify-between">
            <span>{t("paid")}</span>
            <span className="tabular-nums">{money(order.totalMinor)}</span>
          </li>
          <li className="flex justify-between text-ink-muted">
            <span>{t("paymentFee")}</span>
            <span className="tabular-nums">
              {order.paymentFeeMinor == null
                ? t("feePending")
                : `-${money(order.paymentFeeMinor)}`}
            </span>
          </li>
          {order.refundedMinor > 0 ? (
            <li className="flex justify-between">
              <span>{t("refundedTotal")}</span>
              <span className="tabular-nums">
                -{money(order.refundedMinor)}
              </span>
            </li>
          ) : null}
        </ul>
        {order.refunds.length ? (
          <ul className="grid gap-1 text-[13px] text-ink-muted">
            {order.refunds.map((r) => (
              <li key={r.id}>
                {when(r.createdAt)} · {money(r.amountMinor)} ·{" "}
                {t(`refund_${r.status}`)}
              </li>
            ))}
          </ul>
        ) : null}
      </SettingsRow>
      {can(ctx.membership, "REFUNDS_MANAGE") && !ctx.readOnly ? (
        <RefundForm
          orgSlug={ctx.organization.slug}
          orderId={order.id}
          currency={order.currency}
          locale={locale}
          withdrawal={!!order.withdrawalRequestedAt}
          lines={order.lines.map((l) => ({
            id: l.id,
            name: l.variantLabel
              ? `${l.productName} (${l.variantLabel})`
              : l.productName,
            left: l.quantity - l.refundedQuantity,
            unitPriceMinor: l.unitPriceMinor,
            unitPrice: money(l.unitPriceMinor),
          }))}
        />
      ) : null}
    </div>
  );
}
