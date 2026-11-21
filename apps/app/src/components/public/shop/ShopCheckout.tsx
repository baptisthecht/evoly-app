"use client";

import { formatMoney, toLocale } from "@evoly/i18n";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  cancelShopReservationAction,
  submitShopBuyerAction,
} from "@/app/site/[sub]/boutique/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";

export interface PickupChoice {
  id: string;
  name: string;
  address: string;
  instructions: string | null;
}

export interface ShippingChoice {
  id: string;
  name: string;
  priceMinor: number;
}

/** Pays proposés pour la livraison : l'Union européenne, la Suisse, le Royaume-Uni et la Norvège. */
export const SHIPPING_COUNTRIES = [
  "BE",
  "FR",
  "NL",
  "LU",
  "DE",
  "AT",
  "ES",
  "IT",
  "PT",
  "IE",
  "DK",
  "SE",
  "FI",
  "PL",
  "CZ",
  "SK",
  "SI",
  "HR",
  "HU",
  "RO",
  "BG",
  "GR",
  "CY",
  "MT",
  "EE",
  "LV",
  "LT",
  "CH",
  "GB",
  "NO",
] as const;

/**
 * Paiement d'une commande de la boutique (US-SHOP-04, US-SHOP-05, US-SHOP-08) : coordonnées, retrait sur place ou
 * livraison (mode et adresse, frais ajoutés au total), conditions de vente et droit de rétractation, paiement sur la page
 * de Mollie, sur le compte de l'organisation (docs/MOLLIE.md). Les produits restent retenus jusqu'à la fin du compte à
 * rebours.
 */
export function ShopCheckout({
  token,
  organizationName,
  expiresAt,
  subtotalMinor,
  currency,
  locale,
  points,
  shippingMethods = [],
  defaultCountry = "BE",
  payable,
  paymentFailed = false,
}: {
  token: string;
  organizationName: string;
  expiresAt: string;
  /** produits, toutes taxes comprises (la livraison s'y ajoute) */
  subtotalMinor: number;
  currency: string;
  locale: string;
  /** lieux de retrait, si tous les produits acceptent le retrait */
  points: PickupChoice[];
  /** modes de livraison, si tous les produits acceptent la livraison (RG-SHOP-14) */
  shippingMethods?: ShippingChoice[];
  defaultCountry?: string;
  /** compte Mollie de l'organisation prêt à encaisser */
  payable: boolean;
  /** retour de Mollie : paiement abandonné, refusé ou expiré (l'acheteur peut réessayer) */
  paymentFailed?: boolean;
}) {
  const t = useTranslations("shopPublic");
  const tc = useTranslations("checkout");
  const router = useRouter();
  const [left, setLeft] = useState(() => Date.parse(expiresAt) - Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"PICKUP" | "SHIPPING">(
    points.length || !shippingMethods.length ? "PICKUP" : "SHIPPING",
  );
  const [buyer, setBuyer] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    marketingOptIn: false,
    pickupPointId: points.length === 1 ? points[0]!.id : "",
    shippingMethodId:
      shippingMethods.length === 1 ? shippingMethods[0]!.id : "",
  });
  const [address, setAddress] = useState({
    name: "",
    line1: "",
    line2: "",
    postalCode: "",
    city: "",
    country: (SHIPPING_COUNTRIES as readonly string[]).includes(defaultCountry)
      ? defaultCountry
      : "BE",
  });
  const method =
    mode === "SHIPPING"
      ? (shippingMethods.find((m) => m.id === buyer.shippingMethodId) ?? null)
      : null;
  const totalMinor = subtotalMinor + (method?.priceMinor ?? 0);
  const money = (v: number) => formatMoney(v, currency, toLocale(locale));
  const regions = new Intl.DisplayNames([locale], { type: "region" });
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
    if (mode === "PICKUP" && !buyer.pickupPointId) {
      setMessage(t("error_SHOP_PICKUP_REQUIRED"));
      return false;
    }
    if (mode === "SHIPPING" && !buyer.shippingMethodId) {
      setMessage(t("error_SHOP_SHIPPING_REQUIRED"));
      return false;
    }
    if (
      mode === "SHIPPING" &&
      (!address.name.trim() ||
        !address.line1.trim() ||
        !address.postalCode.trim() ||
        !address.city.trim())
    ) {
      setMessage(t("error_SHOP_ADDRESS_REQUIRED"));
      return false;
    }
    return true;
  };

  // docs/MOLLIE.md : paiement sur la page de Mollie, retour sur la page de la commande, validée au retour ou par le
  // webhook
  const pay = async () => {
    if (!valid()) return;
    setBusy(true);
    setMessage(null);
    const { pickupPointId, shippingMethodId, ...person } = buyer;
    const res = await submitShopBuyerAction(token, {
      ...person,
      phone: buyer.phone.trim() || null,
      mode,
      ...(mode === "SHIPPING"
        ? { shippingMethodId, address }
        : { pickupPointId }),
    });
    if (!res.ok) {
      setMessage(explain(res.error));
      return setBusy(false);
    }
    if (res.data.kind === "REDIRECT")
      return window.location.assign(res.data.url);
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
      {paymentFailed ? (
        <p
          className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning"
          role="alert"
        >
          {t("paymentFailed")}
        </p>
      ) : null}
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
      {points.length && shippingMethods.length ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">
            {t("modeTitle")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {(["PICKUP", "SHIPPING"] as const).map((m) => (
              <label
                key={m}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong has-[:checked]:bg-surface-inverse has-[:checked]:text-ink-inverse"
              >
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="sr-only"
                />
                {t(m === "PICKUP" ? "modePickup" : "modeShipping")}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {mode === "SHIPPING" ? (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">
              {t("shippingWhich")}
            </legend>
            {shippingMethods.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl p-4 ring-1 ring-line has-[:checked]:ring-2 has-[:checked]:ring-ink"
              >
                <span className="flex items-center gap-2.5 font-semibold">
                  <input
                    type="radio"
                    name="shipping"
                    value={m.id}
                    checked={buyer.shippingMethodId === m.id}
                    onChange={() => set({ shippingMethodId: m.id })}
                  />
                  {m.name}
                </span>
                <span className="tabular-nums">
                  {m.priceMinor === 0 ? t("shippingFree") : money(m.priceMinor)}
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-semibold">
              {t("addressTitle")}
            </legend>
            <Field label={t("addressName")} htmlFor="ship-name">
              <Input
                id="ship-name"
                autoComplete="shipping name"
                value={address.name}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, name: e.target.value }))
                }
                maxLength={100}
              />
            </Field>
            <Field label={t("addressLine1")} htmlFor="ship-line1">
              <Input
                id="ship-line1"
                autoComplete="shipping address-line1"
                value={address.line1}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, line1: e.target.value }))
                }
                maxLength={120}
              />
            </Field>
            <Field
              label={t("addressLine2")}
              htmlFor="ship-line2"
              optional={t("optional")}
            >
              <Input
                id="ship-line2"
                autoComplete="shipping address-line2"
                value={address.line2}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, line2: e.target.value }))
                }
                maxLength={120}
              />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
              <Field label={t("postalCode")} htmlFor="ship-postal">
                <Input
                  id="ship-postal"
                  autoComplete="shipping postal-code"
                  value={address.postalCode}
                  onChange={(e) =>
                    setAddress((a) => ({ ...a, postalCode: e.target.value }))
                  }
                  maxLength={12}
                />
              </Field>
              <Field label={t("city")} htmlFor="ship-city">
                <Input
                  id="ship-city"
                  autoComplete="shipping address-level2"
                  value={address.city}
                  onChange={(e) =>
                    setAddress((a) => ({ ...a, city: e.target.value }))
                  }
                  maxLength={80}
                />
              </Field>
            </div>
            <Field label={t("country")} htmlFor="ship-country">
              <Select
                id="ship-country"
                autoComplete="shipping country"
                value={address.country}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, country: e.target.value }))
                }
              >
                {SHIPPING_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {regions.of(c) ?? c}
                  </option>
                ))}
              </Select>
            </Field>
          </fieldset>
        </>
      ) : (
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
      )}
      {method ? (
        <div className="grid gap-1 border-t border-line pt-3">
          <p className="flex items-baseline justify-between text-sm">
            <span>
              {t("shippingLine")} · {method.name}
            </span>
            <span className="tabular-nums">
              {method.priceMinor === 0
                ? t("shippingFree")
                : money(method.priceMinor)}
            </span>
          </p>
          <p className="flex items-baseline justify-between font-semibold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{money(totalMinor)}</span>
          </p>
        </div>
      ) : null}
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={buyer.marketingOptIn}
          onChange={(e) => set({ marketingOptIn: e.target.checked })}
          className="mt-0.5"
        />
        {t("optIn", { organization: organizationName })}
      </label>
      {payable ? (
        <div className="grid gap-2">
          {message ? (
            <p
              className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
              role="alert"
            >
              {message}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={busy}
            aria-busy={busy}
            onClick={pay}
          >
            {busy ? tc("processing") : t("pay", { amount: money(totalMinor) })}
          </Button>
          <p className="text-center text-xs text-ink-muted">
            {tc("mollieNotice")}
          </p>
        </div>
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
