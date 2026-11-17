"use client";

import { formatMoney, toLocale } from "@evoly/i18n";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  cancelShopReservationAction,
  confirmShopPaymentAction,
  submitShopBuyerAction,
} from "@/app/site/[sub]/boutique/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { PayButton, PaymentFields, StripePayment } from "../StripePayment";

export interface PickupChoice {
  id: string;
  name: string;
  address: string;
  instructions: string | null;
}

/**
 * Paiement d'une commande de la boutique (US-SHOP-04, US-SHOP-05) : coordonnées, lieu de retrait, conditions de vente
 * et droit de rétractation, paiement par Stripe sur le compte de l'organisation. Les produits restent retenus jusqu'à
 * la fin du compte à rebours.
 */
export function ShopCheckout({
  token,
  organizationName,
  expiresAt,
  totalMinor,
  currency,
  locale,
  points,
  publishableKey,
  stripeAccountId,
}: {
  token: string;
  organizationName: string;
  expiresAt: string;
  totalMinor: number;
  currency: string;
  locale: string;
  points: PickupChoice[];
  publishableKey: string | null;
  stripeAccountId: string | null;
}) {
  const t = useTranslations("shopPublic");
  const router = useRouter();
  const path = `/boutique/commande/${token}`;
  const [left, setLeft] = useState(() => Date.parse(expiresAt) - Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [buyer, setBuyer] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    marketingOptIn: false,
    pickupPointId: points.length === 1 ? points[0]!.id : "",
  });
  useEffect(() => {
    const timer = window.setInterval(
      () => setLeft(Date.parse(expiresAt) - Date.now()),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const explain = (code: string) =>
    t.has(`error_${code}`) ? t(`error_${code}`) : t("error_UNKNOWN");
  const set = (patch: Partial<typeof buyer>) =>
    setBuyer((b) => ({ ...b, ...patch }));
  const valid = () => {
    if (
      !buyer.firstName.trim() ||
      !buyer.lastName.trim() ||
      !buyer.email.trim()
    ) {
      setMessage(t("error_INVALID_BUYER"));
      return false;
    }
    if (!buyer.pickupPointId) {
      setMessage(t("error_SHOP_PICKUP_REQUIRED"));
      return false;
    }
    return true;
  };

  const pay = async (stripe: Stripe, elements: StripeElements) => {
    if (!valid()) return;
    setBusy(true);
    setMessage(null);
    const check = await elements.submit();
    if (check.error) {
      setMessage(check.error.message ?? t("error_UNKNOWN"));
      return setBusy(false);
    }
    const res = await submitShopBuyerAction(token, {
      ...buyer,
      phone: buyer.phone.trim() || null,
    });
    if (!res.ok) {
      setMessage(explain(res.error));
      return setBusy(false);
    }
    if ("paid" in res.data) return router.refresh();
    const created = await stripe.createConfirmationToken({
      elements,
      params: {
        return_url: `${window.location.origin}${path}`,
        payment_method_data: {
          billing_details: {
            name: `${buyer.firstName} ${buyer.lastName}`.trim(),
            email: buyer.email.trim(),
          },
        },
      },
    });
    if (created.error || !created.confirmationToken) {
      setMessage(created.error?.message ?? t("error_UNKNOWN"));
      return setBusy(false);
    }
    const confirmed = await confirmShopPaymentAction(
      token,
      created.confirmationToken.id,
      path,
    );
    if (!confirmed.ok) {
      setMessage(explain(confirmed.error));
      return setBusy(false);
    }
    if (confirmed.data.kind === "ACTION") {
      const { error } = await stripe.handleNextAction({
        clientSecret: confirmed.data.clientSecret,
      });
      if (error) {
        setMessage(error.message ?? t("error_UNKNOWN"));
        return setBusy(false);
      }
    }
    router.refresh();
  };

  if (left <= 0)
    return (
      <div className="grid gap-4">
        <p
          className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning"
          role="alert"
        >
          {t("expired")}
        </p>
        <Button
          type="button"
          variant="dark"
          size="lg"
          onClick={() => router.push("/boutique/panier")}
        >
          {t("backToCart")}
        </Button>
      </div>
    );
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://evoly.me";
  return (
    <div className="grid gap-5">
      <p className="text-sm text-ink-muted" role="timer">
        {t("holdLeft", {
          time: `${minutes}:${String(seconds).padStart(2, "0")}`,
        })}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("firstName")} htmlFor="shop-first">
          <Input
            id="shop-first"
            autoComplete="given-name"
            value={buyer.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
            maxLength={60}
          />
        </Field>
        <Field label={t("lastName")} htmlFor="shop-last">
          <Input
            id="shop-last"
            autoComplete="family-name"
            value={buyer.lastName}
            onChange={(e) => set({ lastName: e.target.value })}
            maxLength={60}
          />
        </Field>
      </div>
      <Field label={t("email")} htmlFor="shop-email" hint={t("emailHint")}>
        <Input
          id="shop-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={buyer.email}
          onChange={(e) => set({ email: e.target.value })}
          maxLength={200}
        />
      </Field>
      <Field label={t("phone")} htmlFor="shop-phone" optional={t("optional")}>
        <Input
          id="shop-phone"
          type="tel"
          autoComplete="tel"
          value={buyer.phone}
          onChange={(e) => set({ phone: e.target.value })}
          maxLength={30}
        />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {t("pickupWhere")}
        </legend>
        {points.length === 0 ? (
          <p className="text-sm text-danger">
            {t("error_SHOP_PICKUP_REQUIRED")}
          </p>
        ) : (
          points.map((p) => (
            <label
              key={p.id}
              className="grid cursor-pointer gap-0.5 rounded-2xl p-4 ring-1 ring-line has-[:checked]:ring-2 has-[:checked]:ring-ink"
            >
              <span className="flex items-center gap-2.5 font-semibold">
                <input
                  type="radio"
                  name="pickup"
                  value={p.id}
                  checked={buyer.pickupPointId === p.id}
                  onChange={() => set({ pickupPointId: p.id })}
                />
                {p.name}
              </span>
              <span className="pl-6 text-sm whitespace-pre-line text-ink-muted">
                {p.address}
              </span>
              {p.instructions ? (
                <span className="pl-6 text-sm text-ink-muted">
                  {p.instructions}
                </span>
              ) : null}
            </label>
          ))
        )}
      </fieldset>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={buyer.marketingOptIn}
          onChange={(e) => set({ marketingOptIn: e.target.checked })}
          className="mt-0.5"
        />
        {t("optIn", { organization: organizationName })}
      </label>
      {publishableKey && stripeAccountId ? (
        <StripePayment
          publishableKey={publishableKey}
          stripeAccountId={stripeAccountId}
          amountMinor={totalMinor}
          currency={currency}
          locale={locale}
        >
          <div className="grid gap-4">
            <PaymentFields />
            {message ? (
              <p
                className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
                role="alert"
              >
                {message}
              </p>
            ) : null}
            <PayButton
              label={t("pay", {
                amount: formatMoney(totalMinor, currency, toLocale(locale)),
              })}
              busy={busy}
              onPay={pay}
            />
          </div>
        </StripePayment>
      ) : (
        <p
          className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning"
          role="alert"
        >
          {t("error_PAYMENTS_UNAVAILABLE")}
        </p>
      )}
      <p className="text-xs text-ink-muted">
        {t.rich("terms", {
          organization: organizationName,
          sale: (c) => (
            <a
              href={`${site}/conditions-de-vente/`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              {c}
            </a>
          ),
        })}
      </p>
      <p className="text-xs text-ink-muted">{t("withdrawalInfo")}</p>
      <button
        type="button"
        className="justify-self-start text-sm underline underline-offset-4"
        onClick={async () => {
          await cancelShopReservationAction(token);
          router.push("/boutique/panier");
        }}
      >
        {t("cancelOrder")}
      </button>
    </div>
  );
}
