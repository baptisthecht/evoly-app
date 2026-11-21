import {
  formatVatRate,
  shippingAddressLines,
  shopOrderTotals,
} from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import { palette } from "@evoly/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { DisabledSite } from "@/components/public/DisabledSite";
import { PublicShell } from "@/components/public/PublicShell";
import {
  ClearCart,
  WithdrawButton,
} from "@/components/public/shop/OrderActions";
import { ShopCheckout } from "@/components/public/shop/ShopCheckout";
import {
  findShopOrderIdByToken,
  shopReservation,
  syncShopPaymentFromMollie,
} from "@/server/shopCheckout";
import { shopOrderForBuyer } from "@/server/shopOrders";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getTranslations("shopPublic"))("orderTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * Commande de la boutique (lien magique) : paiement tant qu'elle est en attente (US-SHOP-05), puis son suivi : état de
 * la préparation, code QR de retrait, reçu avec la TVA de chaque taux (RG-SHOP-10), droit de rétractation (RG-SHOP-11).
 */
export default async function ShopOrderPage({
  params,
}: {
  params: Promise<{ sub: string; token: string }>;
}) {
  const { sub, token } = await params;
  const site = await siteGate(sub, `/boutique/commande/${token}`);
  if (site.kind === "DISABLED")
    return <DisabledSite fallback={site.fallback} />;
  const org = site.org;
  const id = await findShopOrderIdByToken(token);
  if (!id) notFound();
  let reservation = await shopReservation(token);
  if (!reservation || reservation.order.organizationId !== org.id) notFound();
  // retour de la page de paiement de Mollie : paiement relu, commande validée s'il est payé, sans attendre le webhook
  let mollieStatus: string | null = null;
  if (
    (reservation.order.status === "PENDING" ||
      reservation.order.status === "EXPIRED") &&
    reservation.order.molliePaymentId
  ) {
    mollieStatus = await syncShopPaymentFromMollie(id).catch(() => null);
    reservation = (await shopReservation(token))!;
  }
  const { order } = reservation;
  const t = await getTranslations("shopPublic");
  const locale = (await getLocale()) as Locale;
  const money = (v: number) => formatMoney(v, order.currency, locale);
  // en attente du paiement : les produits seuls, la livraison choisie s'ajoute dans le formulaire de paiement
  const pending = order.status === "PENDING" && !reservation.expired;
  // paiement en cours de traitement chez Mollie (quelques secondes) : la page se met à jour toute seule
  const confirming = pending && mollieStatus === "pending";
  const shipping =
    !pending && order.shippingMinor > 0
      ? { amountMinor: order.shippingMinor, vatRateBps: order.shippingVatBps }
      : null;
  const totals = shopOrderTotals(order.lines, shipping);
  const receipt = (
    <section aria-labelledby="receipt" className="grid gap-3">
      <h2 id="receipt" className="font-display text-xl tracking-[-0.02em]">
        {t("receipt")}
      </h2>
      <ul className="grid gap-2">
        {order.lines.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-3">
            <span>
              {l.quantity} × {l.productName}
              {l.variantLabel ? (
                <span className="text-ink-muted"> ({l.variantLabel})</span>
              ) : null}
              <span className="block text-xs text-ink-muted">
                {t("vatRate", { rate: formatVatRate(l.vatRateBps, locale) })}
              </span>
            </span>
            <span className="tabular-nums">
              {money(l.unitPriceMinor * l.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-1 border-t border-line pt-3">
        {shipping ? (
          <p className="flex justify-between text-sm">
            <span>
              {t("shippingLine")}
              {order.shippingName ? ` · ${order.shippingName}` : ""}
            </span>
            <span className="tabular-nums">{money(order.shippingMinor)}</span>
          </p>
        ) : null}
        <p className="flex justify-between font-semibold">
          <span>
            {pending && reservation.shippingMethods.length
              ? t("subtotal")
              : t("total")}
          </span>
          <span className="tabular-nums">
            {money(pending ? order.subtotalMinor : order.totalMinor)}
          </span>
        </p>
        {totals.vat.map((v) => (
          <p
            key={v.rateBps}
            className="flex justify-between text-sm text-ink-muted"
          >
            <span>
              {t("vatIncluded", { rate: formatVatRate(v.rateBps, locale) })}
            </span>
            <span className="tabular-nums">{money(v.vatMinor)}</span>
          </p>
        ))}
        {order.refundedMinor > 0 ? (
          <p className="flex justify-between text-sm">
            <span>{t("refunded")}</span>
            <span className="tabular-nums">-{money(order.refundedMinor)}</span>
          </p>
        ) : null}
      </div>
      <p className="text-xs text-ink-muted">
        {t("seller", {
          organization: org.brand?.displayName ?? org.name,
          reference: order.reference,
        })}
      </p>
    </section>
  );

  // en attente : le paiement
  if (pending)
    return (
      <PublicShell org={org} homeHref="/">
        <div className="mx-auto grid max-w-2xl gap-8 px-5 pb-16 sm:px-8">
          <h1 className="font-display text-[clamp(1.8rem,5vw,2.6rem)] leading-[1] tracking-[-0.03em]">
            {t("checkoutTitle")}
          </h1>
          {receipt}
          {confirming ? (
            <section
              className="grid gap-2 rounded-[1.6rem] bg-surface-raised p-6 ring-1 ring-line"
              aria-live="polite"
            >
              <h2 className="font-semibold">{t("confirmingTitle")}</h2>
              <p className="text-ink-muted">{t("confirmingBody")}</p>
              <AutoRefresh />
            </section>
          ) : (
            <ShopCheckout
              token={token}
              organizationName={org.brand?.displayName ?? org.name}
              expiresAt={order.holdExpiresAt!.toISOString()}
              subtotalMinor={order.subtotalMinor}
              currency={order.currency}
              locale={locale}
              points={reservation.points}
              shippingMethods={reservation.shippingMethods}
              defaultCountry={reservation.country}
              payable={reservation.payable}
              paymentFailed={["canceled", "expired", "failed"].includes(
                mollieStatus ?? "",
              )}
            />
          )}
        </div>
      </PublicShell>
    );

  // expirée ou abandonnée avant le paiement
  if (
    order.status === "PENDING" ||
    order.status === "EXPIRED" ||
    (order.status === "CANCELLED" && !order.paidAt)
  )
    return (
      <PublicShell org={org} homeHref="/">
        <div className="mx-auto grid max-w-2xl gap-5 px-5 pb-16 sm:px-8">
          <h1 className="font-display text-[clamp(1.8rem,5vw,2.6rem)] leading-[1] tracking-[-0.03em]">
            {t("notCompletedTitle")}
          </h1>
          <p>
            {order.refundedMinor > 0
              ? t("notCompletedRefunded")
              : t("notCompletedBody")}
          </p>
          <Link
            href="/boutique/panier"
            className="justify-self-start rounded-full px-5 py-3 font-semibold ring-1 ring-line-strong"
          >
            {t("backToCart")}
          </Link>
        </div>
      </PublicShell>
    );

  const buyer = await shopOrderForBuyer(token);
  const pickupDone = order.fulfillmentStatus === "PICKED_UP";
  const showQr =
    order.fulfillmentMode === "PICKUP" &&
    !pickupDone &&
    order.status !== "REFUNDED" &&
    order.status !== "CANCELLED";
  const qr = showQr
    ? await QRCode.toString(order.pickupCode, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: palette.charbon, light: palette.blanc },
      })
    : null;
  const tz = org.timezone;
  return (
    <PublicShell org={org} homeHref="/">
      <ClearCart organizationId={org.id} />
      <div className="mx-auto grid max-w-2xl gap-8 px-5 pb-16 sm:px-8">
        <header className="grid gap-2">
          <h1 className="font-display text-[clamp(1.8rem,5vw,2.6rem)] leading-[1] tracking-[-0.03em]">
            {order.status === "REFUNDED" || order.status === "CANCELLED"
              ? t("refundedTitle")
              : t("confirmedTitle")}
          </h1>
          <p className="text-ink-muted">
            {t("orderRef", { reference: order.reference })}
          </p>
          <p className="justify-self-start rounded-full bg-surface-inverse px-4 py-2 font-label text-sm font-bold text-ink-inverse">
            {t(`fulfillment_${order.fulfillmentStatus}`)}
          </p>
        </header>
        {qr ? (
          <section
            aria-labelledby="pickup"
            className="grid justify-items-center gap-3 rounded-[1.6rem] bg-surface-raised p-6 text-center ring-1 ring-line"
          >
            <h2 id="pickup" className="font-semibold">
              {t("pickupCodeTitle")}
            </h2>
            <div
              className="w-56 max-w-full"
              role="img"
              aria-label={t("pickupCodeAlt", { code: order.pickupCode })}
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <p className="font-mono text-lg tracking-[0.2em]">
              {order.pickupCode}
            </p>
            {order.pickupName ? (
              <p className="text-sm text-ink-muted whitespace-pre-line">
                <strong className="text-ink">{order.pickupName}</strong>
                {"\n"}
                {order.pickupAddress}
                {order.pickupInstructions
                  ? `\n${order.pickupInstructions}`
                  : ""}
              </p>
            ) : null}
          </section>
        ) : null}
        {pickupDone && order.pickedUpAt ? (
          <p className="text-sm text-ink-muted">
            {t("pickedUpOn", {
              date: formatDateTime(order.pickedUpAt, tz, locale, "short"),
            })}
          </p>
        ) : null}
        {order.fulfillmentMode === "SHIPPING" ? (
          <section aria-labelledby="shipping" className="grid gap-2">
            <h2
              id="shipping"
              className="font-display text-xl tracking-[-0.02em]"
            >
              {t("deliverTo")}
            </h2>
            <p className="text-sm whitespace-pre-line">
              {shippingAddressLines(order, locale).join("\n")}
            </p>
            {order.shippedAt && order.trackingUrl ? (
              <>
                <p className="text-sm text-ink-muted">
                  {t("shippedOn", {
                    date: formatDateTime(order.shippedAt, tz, locale, "short"),
                    carrier: order.carrier ?? "",
                    number: order.trackingNumber ?? "",
                  })}
                </p>
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="justify-self-start rounded-full bg-[var(--accent)] px-5 py-3 font-label font-bold text-[var(--accent-ink)]"
                >
                  {t("trackParcel")}
                </a>
              </>
            ) : (
              <p className="text-sm text-ink-muted">{t("shippingPending")}</p>
            )}
          </section>
        ) : null}
        {receipt}
        <section aria-labelledby="withdrawal" className="grid gap-2">
          <h2
            id="withdrawal"
            className="font-display text-xl tracking-[-0.02em]"
          >
            {t("withdrawalTitle")}
          </h2>
          {order.withdrawalRequestedAt ? (
            <p>
              {t("withdrawalRequested", {
                date: formatDateTime(
                  order.withdrawalRequestedAt,
                  tz,
                  locale,
                  "short",
                ),
              })}
            </p>
          ) : buyer?.canWithdraw ? (
            <>
              <p className="text-sm text-ink-muted">{t("withdrawalHow")}</p>
              <WithdrawButton token={token} />
            </>
          ) : (
            <p className="text-sm text-ink-muted">{t("withdrawalClosed")}</p>
          )}
        </section>
      </div>
    </PublicShell>
  );
}
