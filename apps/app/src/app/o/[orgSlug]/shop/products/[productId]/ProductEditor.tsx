"use client";

import { combinationCount, SHOP_LIMITS } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { uploadFile } from "@/app/o/[orgSlug]/brand/BrandClient";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { SavedNote, SettingsRow, SwitchRow } from "@/components/ui/Controls";
import { Field, Input, TEXTAREA_CLASS } from "@/components/ui/Field";
import { PlusIcon } from "@/components/ui/icons";
import {
  addImageAction,
  deleteProductAction,
  imageCommandAction,
  productStatusAction,
  saveOptionsAction,
  saveVariantsAction,
  updateProductAction,
} from "../../actions";
import type { ProductStatus } from "../../ProductsTable";

/** Lien d'action discret, comme dans les tableaux. */
const LINK =
  "text-[13px] font-medium whitespace-nowrap underline underline-offset-[3px] hover:text-ink-muted disabled:opacity-50";

/**
 * Statut du produit (US-SHOP-01, RG-SHOP-05) : brouillon, en vente ou archivé. La mise en vente demande une variante
 * active et un mode de remise réellement proposé ; sinon le message dit quoi régler.
 */
export function ProductStatusForm({
  orgSlug,
  productId,
  status,
  readOnly,
}: {
  orgSlug: string;
  productId: string;
  status: ProductStatus;
  readOnly: boolean;
}) {
  const t = useTranslations("shop");
  // action de formulaire directe : le bouton cliqué (son statut) fait partie de l'envoi
  const [state, action, pending] = useActionState(
    productStatusAction.bind(null, orgSlug, productId),
    null,
  );
  const next: Array<[ProductStatus, string, "primary" | "secondary"]> =
    status === "ON_SALE"
      ? [
          ["DRAFT", t("unpublish"), "secondary"],
          ["ARCHIVED", t("archive"), "secondary"],
        ]
      : status === "DRAFT"
        ? [
            ["ON_SALE", t("publish"), "primary"],
            ["ARCHIVED", t("archive"), "secondary"],
          ]
        : [
            ["ON_SALE", t("publish"), "primary"],
            ["DRAFT", t("toDraft"), "secondary"],
          ];
  return (
    <SettingsRow
      title={t("statusLabel")}
      description={t(`statusHint_${status}`)}
    >
      <form action={action} className="grid gap-3">
        <FormError state={state} />
        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            {next.map(([value, label, variant]) => (
              <Button
                key={value}
                type="submit"
                name="status"
                value={value}
                variant={variant}
                disabled={pending}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </form>
    </SettingsRow>
  );
}

export interface ProductInfo {
  name: string;
  description: string;
  price: string;
  vatRate: string;
  pickupEnabled: boolean;
  shippingEnabled: boolean;
  featured: boolean;
}

/** Informations du produit : nom, description, prix TTC, TVA, modes de remise acceptés, mise en avant. */
export function ProductInfoForm({
  orgSlug,
  productId,
  info,
  symbol,
  readOnly,
}: {
  orgSlug: string;
  productId: string;
  info: ProductInfo;
  symbol: string;
  readOnly: boolean;
}) {
  const t = useTranslations("shop");
  const { state, pending, formProps } = useActionForm(
    updateProductAction.bind(null, orgSlug, productId),
    null,
  );
  const error = useFieldError(state);
  return (
    <SettingsRow title={t("infoTitle")} description={t("infoHint")}>
      <form {...formProps} className="grid gap-4" noValidate>
        <fieldset disabled={readOnly} className="grid gap-4">
          <FormError state={state} />
          <Field
            label={t("name")}
            htmlFor="product-name"
            error={error("name")}
            required
          >
            <Input
              id="product-name"
              name="name"
              maxLength={80}
              defaultValue={info.name}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={`${t("price")} (${symbol})`}
              htmlFor="product-price"
              error={error("price")}
              hint={t("priceHint")}
              required
            >
              <Input
                id="product-price"
                name="price"
                inputMode="decimal"
                defaultValue={info.price}
                required
              />
            </Field>
            <Field
              label={t("vat")}
              htmlFor="product-vat"
              error={error("vatRate")}
              hint={t("vatHint")}
              required
            >
              <Input
                id="product-vat"
                name="vatRate"
                inputMode="decimal"
                defaultValue={info.vatRate}
                required
              />
            </Field>
          </div>
          <Field
            label={t("description")}
            htmlFor="product-desc"
            error={error("description")}
          >
            <textarea
              id="product-desc"
              name="description"
              rows={5}
              maxLength={2000}
              defaultValue={info.description}
              className={TEXTAREA_CLASS}
            />
          </Field>
          <div className="grid gap-3">
            <SwitchRow
              name="pickupEnabled"
              defaultChecked={info.pickupEnabled}
              label={t("pickupEnabled")}
              hint={t("pickupEnabledHint")}
            />
            <SwitchRow
              name="shippingEnabled"
              defaultChecked={info.shippingEnabled}
              label={t("shippingEnabled")}
              hint={t("shippingEnabledHint")}
            />
            <SwitchRow
              name="featured"
              defaultChecked={info.featured}
              label={t("featuredLabel")}
              hint={t("featuredHint")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {t("save")}
            </Button>
            {state?.ok ? (
              <SavedNote id="product-info-status">{t("saved")}</SavedNote>
            ) : null}
          </div>
        </fieldset>
      </form>
    </SettingsRow>
  );
}

export interface ImageItem {
  id: string;
  url: string;
  alt: string;
}

/**
 * Photos du produit (10 au plus) : import de plusieurs fichiers, photo principale (la première), ordre, texte
 * alternatif, retrait.
 */
export function ProductImages({
  orgSlug,
  productId,
  name,
  images,
  readOnly,
}: {
  orgSlug: string;
  productId: string;
  name: string;
  images: ImageItem[];
  readOnly: boolean;
}) {
  const t = useTranslations("shop");
  const te = useTranslations("formErrors");
  const tb = useTranslations("brand");
  const router = useRouter();
  // erreur de l'import (textes de la page Marque) ou de l'ajout à la galerie
  const message = (code: string) =>
    te.has(code)
      ? te(code)
      : tb.has(`upload_${code}`)
        ? tb(`upload_${code}`)
        : tb("upload_UNKNOWN");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = images.length >= SHOP_LIMITS.images;
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of [...files].slice(
        0,
        SHOP_LIMITS.images - images.length,
      )) {
        const res = await uploadFile(orgSlug, file, "product", productId);
        const added = res.url
          ? await addImageAction(orgSlug, productId, res.url)
          : null;
        const code = res.error ?? (added && !added.ok ? added.error : null);
        if (code) {
          setError(message(code));
          break;
        }
      }
    } catch {
      setError(tb("upload_UNKNOWN"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  };
  return (
    <SettingsRow title={t("imagesTitle")} description={t("imagesHint")} wide>
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li
              key={img.id}
              className="grid content-start gap-2 rounded-[var(--r-card)] border border-line bg-surface-raised p-2"
            >
              <img
                src={img.url}
                alt={img.alt || name}
                className="aspect-square w-full rounded-[8px] object-cover"
              />
              {i === 0 ? (
                <small className="text-[12px] font-medium text-ink-muted">
                  {t("mainImage")}
                </small>
              ) : null}
              {readOnly ? null : (
                <ImageCommands
                  orgSlug={orgSlug}
                  productId={productId}
                  image={img}
                  first={i === 0}
                  last={i === images.length - 1}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-muted">{t("noImage")}</p>
      )}
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            id="product-images"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => upload(e.target.files)}
            disabled={busy || full}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => input.current?.click()}
            disabled={busy || full}
            aria-busy={busy}
          >
            <PlusIcon />
            {busy ? t("uploading") : t("addImages")}
          </Button>
          <label htmlFor="product-images" className="sr-only">
            {t("addImages")}
          </label>
          <small className="text-[12.5px] text-ink-muted">
            {full ? t("imagesFull") : t("imagesLimits")}
          </small>
        </div>
      )}
    </SettingsRow>
  );
}

function ImageCommands({
  orgSlug,
  productId,
  image,
  first,
  last,
}: {
  orgSlug: string;
  productId: string;
  image: ImageItem;
  first: boolean;
  last: boolean;
}) {
  const t = useTranslations("shop");
  const [state, action, pending] = useActionState(
    imageCommandAction.bind(null, orgSlug, productId, image.id),
    null,
  );
  return (
    <form
      action={action}
      className="grid gap-2"
      onSubmit={(e) => {
        const command = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
          "value",
        );
        if (command === "remove" && !window.confirm(t("removeImageConfirm")))
          e.preventDefault();
      }}
    >
      <label className="grid gap-1 text-[12px] text-ink-muted">
        {t("alt")}
        <input
          name="alt"
          defaultValue={image.alt}
          maxLength={200}
          className="h-8 rounded-[7px] border border-line-strong bg-surface-raised px-2 text-[13px] text-ink"
        />
      </label>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button
          type="submit"
          name="command"
          value="alt"
          className={LINK}
          disabled={pending}
        >
          {t("saveAlt")}
        </button>
        {first ? null : (
          <button
            type="submit"
            name="command"
            value="first"
            className={LINK}
            disabled={pending}
          >
            {t("makeMain")}
          </button>
        )}
        {first ? null : (
          <button
            type="submit"
            name="command"
            value="up"
            className={LINK}
            disabled={pending}
            aria-label={t("moveEarlier")}
          >
            ←
          </button>
        )}
        {last ? null : (
          <button
            type="submit"
            name="command"
            value="down"
            className={LINK}
            disabled={pending}
            aria-label={t("moveLater")}
          >
            →
          </button>
        )}
        <button
          type="submit"
          name="command"
          value="remove"
          className={LINK}
          disabled={pending}
        >
          {t("remove")}
        </button>
      </div>
      <FormError state={state} />
    </form>
  );
}

export interface OptionGroupItem {
  id?: string;
  name: string;
  values: Array<{ id?: string; name: string }>;
}

/** Valeurs d'une option : pastilles retirables, nouvelle valeur ajoutée par Entrée ou virgule. */
function ValuesInput({
  groupIndex,
  values,
  onChange,
  disabled,
}: {
  groupIndex: number;
  values: OptionGroupItem["values"];
  onChange: (values: OptionGroupItem["values"]) => void;
  disabled: boolean;
}) {
  const t = useTranslations("shop");
  const [draft, setDraft] = useState("");
  const add = () => {
    const names = draft
      .split(",")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const known = new Set(values.map((v) => v.name.toLocaleLowerCase()));
    const fresh = names.filter((n) => !known.has(n.toLocaleLowerCase()));
    if (fresh.length)
      onChange([
        ...values,
        ...fresh
          .slice(0, SHOP_LIMITS.values - values.length)
          .map((name) => ({ name })),
      ]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    }
  };
  return (
    <div className="grid gap-2">
      {values.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("valuesLabel")}>
          {values.map((v, i) => (
            <li
              key={v.id ?? `new-${i}`}
              className="inline-flex items-center gap-1 rounded-[7px] bg-surface-sunken py-0.5 pr-1 pl-2 text-[13px]"
            >
              {v.name}
              <button
                type="button"
                className="grid size-5 place-items-center rounded-[5px] text-ink-muted hover:bg-surface-hover hover:text-ink"
                aria-label={t("removeValue", { name: v.name })}
                onClick={() => onChange(values.filter((_, k) => k !== i))}
                disabled={disabled}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={`option-${groupIndex}-new-value`}
        aria-label={t("addValue")}
        placeholder={t("addValuePlaceholder")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        maxLength={80}
        disabled={disabled || values.length >= SHOP_LIMITS.values}
      />
    </div>
  );
}

/**
 * Options libres du produit (US-SHOP-02, RG-SHOP-03) : jusqu'à 3 options (« Taille », « Couleur »), 20 valeurs chacune ;
 * chaque combinaison devient une variante avec son stock et son supplément.
 */
export function ProductOptionsEditor({
  orgSlug,
  productId,
  groups: initial,
  readOnly,
}: {
  orgSlug: string;
  productId: string;
  groups: OptionGroupItem[];
  readOnly: boolean;
}) {
  const t = useTranslations("shop");
  const [groups, setGroups] = useState<OptionGroupItem[]>(initial);
  const { state, pending, formProps } = useActionForm(
    saveOptionsAction.bind(null, orgSlug, productId),
    null,
  );
  const count = combinationCount(groups.map((g) => g.values.length));
  const tooMany = count > SHOP_LIMITS.variants;
  const update = (i: number, patch: Partial<OptionGroupItem>) =>
    setGroups((gs) => gs.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  return (
    <SettingsRow title={t("optionsTitle")} description={t("optionsHint")}>
      <form {...formProps} className="grid gap-4" noValidate>
        <input type="hidden" name="groups" value={JSON.stringify(groups)} />
        <FormError state={state} />
        {groups.map((g, i) => (
          <fieldset
            key={g.id ?? `new-${i}`}
            className="grid gap-2 rounded-[var(--r-card)] border border-line p-3"
            disabled={readOnly}
          >
            <legend className="sr-only">{g.name || t("optionName")}</legend>
            <div className="flex items-end gap-2">
              <Field label={t("optionName")} htmlFor={`option-${i}-name`}>
                <Input
                  id={`option-${i}-name`}
                  value={g.name}
                  placeholder={t("optionNamePlaceholder")}
                  maxLength={40}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </Field>
              <button
                type="button"
                className={`${LINK} mb-2.5`}
                onClick={() => setGroups((gs) => gs.filter((_, k) => k !== i))}
              >
                {t("removeOption")}
              </button>
            </div>
            <ValuesInput
              groupIndex={i}
              values={g.values}
              onChange={(values) => update(i, { values })}
              disabled={readOnly}
            />
          </fieldset>
        ))}
        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-3">
            {groups.length < SHOP_LIMITS.groups ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setGroups((gs) => [...gs, { name: "", values: [] }])
                }
              >
                <PlusIcon />
                {t("addOption")}
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={pending || tooMany}
              aria-busy={pending}
            >
              {t("saveOptions")}
            </Button>
            <small
              className={
                tooMany
                  ? "text-[12.5px] text-danger"
                  : "text-[12.5px] text-ink-muted"
              }
            >
              {tooMany
                ? t("tooManyVariants", { max: SHOP_LIMITS.variants })
                : t("variantCount", { count })}
            </small>
            {state?.ok ? (
              <SavedNote id="product-options-status">{t("saved")}</SavedNote>
            ) : null}
          </div>
        )}
      </form>
    </SettingsRow>
  );
}

export interface VariantItem {
  id: string;
  /** « M · Noir » ; vide : le produit sans option */
  label: string;
  /** prix de la variante, supplément compris : « 28 € » */
  price: string;
  delta: string;
  stock: string;
  held: number;
  sold: number;
  active: boolean;
}

/**
 * Stock et supplément de chaque variante (US-SHOP-02, RG-SHOP-04) : stock vide, illimité ; une variante décochée n'est
 * plus en vente ; les paniers en cours de paiement et les ventes sont rappelés.
 */
export function VariantsForm({
  orgSlug,
  productId,
  variants,
  symbol,
  readOnly,
}: {
  orgSlug: string;
  productId: string;
  variants: VariantItem[];
  symbol: string;
  readOnly: boolean;
}) {
  const t = useTranslations("shop");
  const { state, pending, formProps } = useActionForm(
    saveVariantsAction.bind(null, orgSlug, productId),
    null,
  );
  const single = variants.length === 1 && variants[0]!.label === "";
  return (
    <SettingsRow
      title={single ? t("stockTitle") : t("variantsTitle")}
      description={t("variantsHint")}
      wide
    >
      <form {...formProps} className="grid gap-3" noValidate>
        <input
          type="hidden"
          name="ids"
          value={variants.map((v) => v.id).join(",")}
        />
        <FormError state={state} />
        <fieldset disabled={readOnly} className="grid gap-2">
          <legend className="sr-only">{t("variantsTitle")}</legend>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] gap-3 px-1 text-[12px] font-medium text-ink-muted sm:grid">
            <span>{t("variant")}</span>
            <span>{`${t("supplement")} (${symbol})`}</span>
            <span>{t("stock")}</span>
            <span>{t("onSaleShort")}</span>
            <span className="w-24 text-right">{t("salesShort")}</span>
          </div>
          {variants.map((v) => (
            <VariantRow key={v.id} v={v} single={single} />
          ))}
        </fieldset>
        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {t("saveStock")}
            </Button>
            {state?.ok ? (
              <SavedNote id="product-variants-status">{t("saved")}</SavedNote>
            ) : null}
          </div>
        )}
      </form>
    </SettingsRow>
  );
}

function VariantRow({ v, single }: { v: VariantItem; single: boolean }) {
  const t = useTranslations("shop");
  const name = single ? t("singleVariant") : v.label;
  const cell = (label: string, child: ReactNode) => (
    <label className="grid gap-1 text-[12px] text-ink-muted sm:block">
      <span className="sm:sr-only">{label}</span>
      {child}
    </label>
  );
  return (
    <div className="grid grid-cols-2 items-center gap-3 rounded-[var(--r-card)] border border-line bg-surface-raised p-3 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] sm:border-0 sm:bg-transparent sm:p-1">
      <span className="col-span-2 min-w-0 sm:col-span-1">
        <b className="block truncate text-[14px] font-semibold">{name}</b>
        <small className="text-[12.5px] text-ink-muted tabular-nums">
          {v.price}
        </small>
      </span>
      {cell(
        t("supplement"),
        <Input
          name={`delta.${v.id}`}
          inputMode="decimal"
          defaultValue={v.delta}
          placeholder="0"
          aria-label={`${t("supplement")} : ${name}`}
          disabled={single}
        />,
      )}
      {cell(
        t("stock"),
        <Input
          name={`stock.${v.id}`}
          inputMode="numeric"
          defaultValue={v.stock}
          placeholder={t("unlimited")}
          aria-label={`${t("stock")} : ${name}`}
        />,
      )}
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          role="switch"
          name={`active.${v.id}`}
          defaultChecked={v.active}
          aria-label={`${t("onSaleShort")} : ${name}`}
        />
        <span className="sm:sr-only">{t("onSaleShort")}</span>
      </label>
      <small className="text-[12.5px] text-ink-muted tabular-nums sm:w-24 sm:text-right">
        {v.held > 0
          ? t("heldAndSold", { held: v.held, sold: v.sold })
          : t("soldCount", { count: v.sold })}
      </small>
    </div>
  );
}

/** Suppression d'un produit jamais vendu ; vendu, il s'archive (RG-SHOP-06). */
export function DeleteProduct({
  orgSlug,
  productId,
  name,
  sold,
}: {
  orgSlug: string;
  productId: string;
  name: string;
  sold: boolean;
}) {
  const t = useTranslations("shop");
  const [state, action, pending] = useActionState(
    deleteProductAction.bind(null, orgSlug, productId),
    null,
  );
  return (
    <SettingsRow title={t("deleteTitle")} description={t("deleteHint")}>
      {sold ? (
        <p className="text-[13px] text-ink-muted">{t("deleteSold")}</p>
      ) : (
        <form
          action={action}
          onSubmit={(e) =>
            window.confirm(t("deleteProductConfirm", { name }))
              ? undefined
              : e.preventDefault()
          }
          className="grid gap-3"
        >
          <FormError state={state} />
          <div>
            <Button type="submit" variant="danger" disabled={pending}>
              {t("deleteProduct")}
            </Button>
          </div>
        </form>
      )}
    </SettingsRow>
  );
}
