"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Field, Input, TEXTAREA_CLASS } from "@/components/ui/Field";
import { PlusIcon } from "@/components/ui/icons";
import { createProductAction } from "./actions";

export type ProductStatus = "DRAFT" | "ON_SALE" | "ARCHIVED";

export interface ProductItem {
  id: string;
  name: string;
  status: ProductStatus;
  featured: boolean;
  imageUrl: string | null;
  /** « 25 € », « à partir de 25 € » */
  price: string;
  priceSort: number;
  /** unités disponibles ; null : sans limite */
  stock: number | null;
  sold: number;
  variants: number;
  href: string;
}

const STATUS_TONE = {
  ON_SALE: "success",
  DRAFT: "neutral",
  ARCHIVED: "neutral",
} as const;

/** Pastille du statut d'un produit (tableau et en-tête de sa fiche). */
export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const t = useTranslations("shop");
  return (
    <Badge tone={STATUS_TONE[status]} dot={status === "ON_SALE"}>
      {t(`status_${status}`)}
    </Badge>
  );
}

/** Photo principale d'un produit, ou un carré gris. */
function Thumb({ url }: { url: string | null }) {
  return url ? (
    <img
      src={url}
      alt=""
      className="size-10 shrink-0 rounded-[8px] border border-line object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="size-10 shrink-0 rounded-[8px] border border-dashed border-line-strong bg-surface-sunken"
    />
  );
}

/**
 * Boutique, onglet Produits : le catalogue (photo, nom, prix, stock, ventes, statut), une ligne mène à la fiche du
 * produit. Recherche par nom ; vide : « Nouveau produit ».
 */
export function ProductsTable({
  rows,
  orgSlug,
  canManage,
  symbol,
  defaultVat,
}: {
  rows: ProductItem[];
  orgSlug: string;
  canManage: boolean;
  symbol: string;
  defaultVat: string;
}) {
  const t = useTranslations("shop");
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const shown = q
    ? rows.filter((r) => r.name.toLocaleLowerCase().includes(q))
    : rows;
  const columns: TableColumn<ProductItem>[] = [
    {
      key: "name",
      header: t("product"),
      sortable: true,
      mobile: "title",
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-3">
          <Thumb url={p.imageUrl} />
          <span className="min-w-0">
            <b className="block truncate font-semibold">{p.name}</b>
            {p.featured ? (
              <small className="text-[12px] text-ink-muted">
                {t("featured")}
              </small>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "price",
      header: t("price"),
      sortable: true,
      align: "right",
      sortValue: (p) => p.priceSort,
      mobile: "subtitle",
      className: "tabular-nums whitespace-nowrap",
    },
    {
      key: "stock",
      header: t("stock"),
      sortable: true,
      align: "right",
      sortValue: (p) => (p.stock == null ? Number.MAX_SAFE_INTEGER : p.stock),
      cell: (p) =>
        p.stock == null ? (
          <span className="text-[13px] text-ink-muted">{t("unlimited")}</span>
        ) : p.stock === 0 ? (
          <Badge tone="danger">{t("soldOut")}</Badge>
        ) : (
          <span className="tabular-nums">{p.stock}</span>
        ),
    },
    {
      key: "sold",
      header: t("sold"),
      sortable: true,
      align: "right",
      className: "tabular-nums",
    },
    {
      key: "status",
      header: t("statusLabel"),
      sortable: true,
      mobile: "badge",
      cell: (p) => <ProductStatusBadge status={p.status} />,
    },
  ];
  return (
    <DataTable
      rows={shown}
      columns={columns}
      getRowId={(p) => p.id}
      rowHref={(p) => p.href}
      caption={t("productsCaption")}
      search={{
        value: query,
        onChange: setQuery,
        placeholder: t("searchProducts"),
      }}
      emptyState={
        q
          ? { title: t("noMatch") }
          : {
              title: t("emptyTitle"),
              description: t("emptyBody"),
              action: canManage ? (
                <NewProductDialog
                  orgSlug={orgSlug}
                  symbol={symbol}
                  defaultVat={defaultVat}
                />
              ) : undefined,
            }
      }
    />
  );
}

/**
 * « Nouveau produit » (bande du titre, ou tableau vide) : nom, prix, TVA, stock et description dans une fenêtre ; le
 * produit est créé en brouillon et sa fiche s'ouvre (photos, options, stock de chaque variante).
 */
export function NewProductDialog({
  orgSlug,
  symbol,
  defaultVat,
}: {
  orgSlug: string;
  symbol: string;
  defaultVat: string;
}) {
  const t = useTranslations("shop");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("newProduct")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("newProduct")}
        description={t("newIntro")}
      >
        <NewProductForm
          orgSlug={orgSlug}
          symbol={symbol}
          defaultVat={defaultVat}
          onCancel={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

function NewProductForm({
  orgSlug,
  symbol,
  defaultVat,
  onCancel,
}: {
  orgSlug: string;
  symbol: string;
  defaultVat: string;
  onCancel: () => void;
}) {
  const t = useTranslations("shop");
  const tc = useTranslations("common");
  const { state, pending, formProps } = useActionForm(
    createProductAction.bind(null, orgSlug),
    null,
  );
  const error = useFieldError(state);
  return (
    <form {...formProps} id="product-new" className="grid gap-4" noValidate>
      <FormError state={state} />
      <Field
        label={t("name")}
        htmlFor="product-new-name"
        error={error("name")}
        required
      >
        <Input
          id="product-new-name"
          name="name"
          maxLength={80}
          placeholder={t("namePlaceholder")}
          required
          data-autofocus
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={`${t("price")} (${symbol})`}
          htmlFor="product-new-price"
          error={error("price")}
          required
        >
          <Input
            id="product-new-price"
            name="price"
            inputMode="decimal"
            required
          />
        </Field>
        <Field
          label={t("vat")}
          htmlFor="product-new-vat"
          error={error("vatRate")}
          required
        >
          <Input
            id="product-new-vat"
            name="vatRate"
            inputMode="decimal"
            defaultValue={defaultVat}
            required
          />
        </Field>
        <Field
          label={t("stock")}
          htmlFor="product-new-stock"
          error={error("stock")}
          hint={t("stockHint")}
        >
          <Input id="product-new-stock" name="stock" inputMode="numeric" />
        </Field>
      </div>
      <Field
        label={t("description")}
        htmlFor="product-new-desc"
        error={error("description")}
      >
        <textarea
          id="product-new-desc"
          name="description"
          rows={3}
          maxLength={2000}
          className={TEXTAREA_CLASS}
        />
      </Field>
      {/* modes de remise : retrait en main propre par défaut, à régler ensuite sur la fiche */}
      <input type="hidden" name="pickupEnabled" value="on" />
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button
          type="submit"
          form="product-new"
          disabled={pending}
          aria-busy={pending}
        >
          {t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Aperçu grisé de l'onglet Produits, pour l'encart Pro de l'offre gratuite. */
export function ShopPreview() {
  const t = useTranslations("shop");
  const rows = [
    [t("previewItem1"), "25 €", "42"],
    [t("previewItem2"), "12 €", "18"],
    [t("previewItem3"), "15 €", "7"],
  ];
  return (
    <div className="grid max-w-xl gap-2">
      {rows.map(([name, price, stock]) => (
        <div
          key={name}
          className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-raised px-3 py-2"
        >
          <span className="size-9 rounded-[8px] bg-surface-sunken" />
          <span className="flex-1 text-[13.5px] font-semibold">{name}</span>
          <span className="text-[13px] tabular-nums">{price}</span>
          <span className="w-10 text-right text-[13px] text-ink-muted tabular-nums">
            {stock}
          </span>
        </div>
      ))}
    </div>
  );
}
