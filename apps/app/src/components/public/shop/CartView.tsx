"use client";

import { formatMoney, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  cartPreviewAction,
  reserveCartAction,
} from "@/app/site/[sub]/boutique/actions";
import { Button } from "@/components/ui/Button";
import type { CartPreviewLine } from "@/server/shopCheckout";
import { readCart, writeCart, type CartLine } from "./cart";

/**
 * Panier de la boutique (US-SHOP-04) : lignes relues par le serveur (prix et disponibilité actuels), quantités,
 * retrait d'une ligne, total ; « Commander » retient les produits pendant le paiement (RG-SHOP-07).
 */
export function CartView({
  sub,
  organizationId,
  locale,
  currency,
}: {
  sub: string;
  organizationId: string;
  locale: Locale;
  currency: string;
}) {
  const t = useTranslations("shopPublic");
  const router = useRouter();
  const [lines, setLines] = useState<CartPreviewLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const money = (v: number) =>
    formatMoney(v, currency, locale, { trimZeroCents: true });
  const explain = (code: string) =>
    t.has(`error_${code}`) ? t(`error_${code}`) : t("error_UNKNOWN");

  const load = useCallback(
    async (cart: CartLine[]) => {
      const res = await cartPreviewAction(sub, cart);
      const data = res.ok ? res.data : [];
      setLines(data);
      // lignes disparues (produit retiré de la boutique) : enlevées du panier
      if (data.length !== cart.length)
        writeCart(
          organizationId,
          cart.filter((l) => data.some((d) => d.variantId === l.variantId)),
        );
    },
    [sub, organizationId],
  );
  useEffect(() => {
    void load(readCart(organizationId));
  }, [load, organizationId]);

  const change = (variantId: string, quantity: number) => {
    const cart = readCart(organizationId)
      .map((l) => (l.variantId === variantId ? { ...l, quantity } : l))
      .filter((l) => l.quantity > 0);
    writeCart(organizationId, cart);
    setMessage(null);
    void load(cart);
  };

  const order = async () => {
    setBusy(true);
    setMessage(null);
    const res = await reserveCartAction(sub, readCart(organizationId));
    if (!res.ok) {
      setMessage(explain(res.error));
      setBusy(false);
      void load(readCart(organizationId));
      return;
    }
    router.push(`/boutique/commande/${res.data.token}`);
  };

  if (lines === null)
    return <p className="text-ink-muted">{t("loadingCart")}</p>;
  if (lines.length === 0)
    return (
      <div className="grid justify-items-start gap-4">
        <p>{t("emptyCart")}</p>
        <Link
          href="/boutique"
          className="inline-flex min-h-11 items-center rounded-full px-5 font-semibold ring-1 ring-line-strong"
        >
          {t("backToShop")}
        </Link>
      </div>
    );
  const total = lines.reduce((n, l) => n + l.unitPriceMinor * l.quantity, 0);
  const blocked = lines.some((l) => l.problem);
  const modes =
    lines.every((l) => l.pickupEnabled) ||
    lines.every((l) => l.shippingEnabled);
  return (
    <div className="grid gap-6">
      <ul className="grid gap-3">
        {lines.map((l) => (
          <li
            key={l.variantId}
            className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 rounded-2xl bg-surface-raised p-3 ring-1 ring-line sm:grid-cols-[5rem_minmax(0,1fr)_auto]"
          >
            {l.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={l.imageUrl}
                alt=""
                className="size-16 rounded-xl object-cover sm:size-20"
              />
            ) : (
              <span className="size-16 rounded-xl bg-surface-sunken sm:size-20" />
            )}
            <div className="grid content-start gap-1">
              <Link
                href={`/boutique/${l.productSlug}`}
                className="font-semibold"
              >
                {l.productName}
              </Link>
              {l.variantLabel ? (
                <span className="text-sm text-ink-muted">{l.variantLabel}</span>
              ) : null}
              <span className="text-sm tabular-nums">
                {money(l.unitPriceMinor)}
              </span>
              {l.problem ? (
                <span
                  className="text-sm font-semibold text-danger"
                  role="alert"
                >
                  {l.problem === "UNAVAILABLE"
                    ? t("lineUnavailable")
                    : t("lineNotEnough", { count: l.available ?? 0 })}
                </span>
              ) : null}
            </div>
            <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:grid sm:justify-items-end">
              <div className="inline-flex items-center gap-1 rounded-full ring-1 ring-line-strong">
                <button
                  type="button"
                  className="grid size-10 place-items-center disabled:opacity-40"
                  aria-label={t("lessOf", { name: l.productName })}
                  onClick={() => change(l.variantId, l.quantity - 1)}
                >
                  -
                </button>
                <span className="w-7 text-center font-semibold tabular-nums">
                  {l.quantity}
                </span>
                <button
                  type="button"
                  className="grid size-10 place-items-center disabled:opacity-40"
                  aria-label={t("moreOf", { name: l.productName })}
                  disabled={
                    l.quantity >= 20 ||
                    (l.available != null && l.quantity >= l.available)
                  }
                  onClick={() => change(l.variantId, l.quantity + 1)}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="text-sm underline underline-offset-4"
                onClick={() => change(l.variantId, 0)}
              >
                {t("removeLine")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-line pt-4">
        <span className="font-semibold">{t("total")}</span>
        <span className="font-label text-xl font-bold tabular-nums">
          {money(total)}
        </span>
      </div>
      {!modes ? (
        <p
          className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning"
          role="alert"
        >
          {t("modesConflict")}
        </p>
      ) : null}
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
        disabled={busy || blocked || !modes}
        aria-busy={busy}
        onClick={order}
      >
        {t("checkout")}
      </Button>
    </div>
  );
}
