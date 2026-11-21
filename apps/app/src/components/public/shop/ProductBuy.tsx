"use client";

import { variantKey } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useHydrated } from "@/components/useHydrated";
import { addToCart, useCartCount } from "./cart";

export interface ProductBuyProps {
  organizationId: string;
  locale: Locale;
  currency: string;
  name: string;
  images: Array<{ url: string; alt: string | null }>;
  options: Array<{
    id: string;
    name: string;
    values: Array<{ id: string; name: string }>;
  }>;
  variants: Array<{
    id: string;
    key: string;
    priceMinor: number;
    available: number | null;
  }>;
}

/** Galerie d'un produit : la photo choisie en grand, les autres en vignettes. */
export function ProductGallery({
  name,
  images,
}: {
  name: string;
  images: ProductBuyProps["images"];
}) {
  const t = useTranslations("shopPublic");
  const [shown, setShown] = useState(0);
  if (!images.length)
    return (
      <div
        aria-hidden="true"
        className="aspect-square w-full rounded-[1.6rem] bg-surface-sunken"
      />
    );
  const main = images[Math.min(shown, images.length - 1)]!;
  return (
    <div className="grid gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={main.url}
        alt={main.alt || name}
        className="aspect-square w-full rounded-[1.6rem] bg-surface-sunken object-cover"
      />
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto" aria-label={t("gallery")}>
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setShown(i)}
                aria-label={t("showPhoto", { n: i + 1 })}
                aria-pressed={i === shown}
                className={`block size-16 overflow-hidden rounded-xl ring-2 ${i === shown ? "ring-ink" : "ring-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Choix des options (une valeur par option), prix de la variante, disponibilité, quantité et « Ajouter au panier »
 * (US-SHOP-04). Le panier vit dans le navigateur ; le serveur relit tout avant la réservation.
 */
export function ProductBuy({
  organizationId,
  locale,
  currency,
  options,
  variants,
}: ProductBuyProps) {
  const t = useTranslations("shopPublic");
  const ready = useHydrated();
  const count = useCartCount(organizationId);
  // choix de départ : la première valeur de chaque option dont une variante est disponible, sinon la première
  const [picked, setPicked] = useState<Record<string, string>>(() => {
    const firstOk = variants.find((v) => v.available !== 0) ?? variants[0];
    const ids = new Set(firstOk?.key.split(".") ?? []);
    return Object.fromEntries(
      options.map((g) => [
        g.id,
        g.values.find((v) => ids.has(v.id))?.id ?? g.values[0]!.id,
      ]),
    );
  });
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const key = variantKey(options.map((g) => picked[g.id]!));
  const variant = variants.find((v) => v.key === key) ?? null;
  const max = Math.min(20, variant?.available ?? 20);
  const soldOut = !variant || variant.available === 0;
  const money = (v: number) =>
    formatMoney(v, currency, locale, { trimZeroCents: true });
  return (
    <div className="grid gap-5">
      <p className="font-label text-2xl font-bold" aria-live="polite">
        {variant ? money(variant.priceMinor) : t("unavailable")}
      </p>
      {options.map((g) => (
        <fieldset key={g.id} className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">{g.name}</legend>
          <div className="flex flex-wrap gap-2">
            {g.values.map((v) => {
              const k = variantKey(
                options.map((o) => (o.id === g.id ? v.id : picked[o.id]!)),
              );
              const out = variants.find((x) => x.key === k)?.available === 0;
              const missing = !variants.some((x) => x.key === k);
              return (
                <label
                  key={v.id}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold ring-1 has-[:checked]:bg-surface-inverse has-[:checked]:text-ink-inverse has-[:focus-visible]:outline-2 ${out || missing ? "text-ink-muted ring-line line-through" : "ring-line-strong"}`}
                >
                  <input
                    type="radio"
                    name={`option-${g.id}`}
                    value={v.id}
                    checked={picked[g.id] === v.id}
                    onChange={() => {
                      setPicked((p) => ({ ...p, [g.id]: v.id }));
                      setQuantity(1);
                      setAdded(false);
                    }}
                    className="sr-only"
                  />
                  {v.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {variant &&
      variant.available != null &&
      variant.available > 0 &&
      variant.available <= 5 ? (
        <p className="text-sm font-semibold">
          {t("fewLeft", { count: variant.available })}
        </p>
      ) : null}
      {soldOut ? (
        <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm font-semibold">
          {t("soldOut")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-full ring-1 ring-line-strong">
            <button
              type="button"
              className="grid size-11 place-items-center text-lg disabled:opacity-40"
              aria-label={t("less")}
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              -
            </button>
            <span
              className="w-8 text-center font-semibold tabular-nums"
              aria-live="polite"
            >
              {quantity}
            </span>
            <button
              type="button"
              className="grid size-11 place-items-center text-lg disabled:opacity-40"
              aria-label={t("more")}
              disabled={quantity >= max}
              onClick={() => setQuantity((q) => Math.min(max, q + 1))}
            >
              +
            </button>
          </div>
          <Button
            type="button"
            size="lg"
            disabled={!ready}
            onClick={() => {
              addToCart(organizationId, variant!.id, quantity);
              setAdded(true);
            }}
          >
            {t("addToCart")}
          </Button>
        </div>
      )}
      {added ? (
        <p role="status" className="text-sm">
          {t("added")}{" "}
          <Link
            href="/boutique/panier"
            className="font-semibold underline underline-offset-4"
          >
            {t("viewCart", { count })}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** Lien vers le panier, avec son nombre d'articles (en-tête de la boutique). */
export function CartLink({ organizationId }: { organizationId: string }) {
  const t = useTranslations("shopPublic");
  const count = useCartCount(organizationId);
  return (
    <Link
      href="/boutique/panier"
      className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-line"
    >
      {t("cart")}
      {count > 0 ? (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold text-[var(--accent-ink)] tabular-nums">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
