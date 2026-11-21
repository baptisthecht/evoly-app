"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Field, Input, TEXTAREA_CLASS } from "@/components/ui/Field";
import { PlusIcon } from "@/components/ui/icons";
import {
  deliveryCommandAction,
  savePickupPointAction,
  saveShippingMethodAction,
} from "./actions";

export interface PickupPointItem {
  id: string;
  name: string;
  address: string;
  instructions: string;
  active: boolean;
}

export interface ShippingMethodItem {
  id: string;
  name: string;
  /** « 4,90 € », « Offerte » */
  price: string;
  priceMinor: number;
  /** valeur du champ de saisie : « 4,90 » */
  priceInput: string;
  active: boolean;
}

/** Lien d'action d'une ligne, comme « Débloquer » dans les personnes bloquées. */
const LINK =
  "text-[13px] font-medium whitespace-nowrap underline underline-offset-[3px] hover:text-ink-muted disabled:opacity-50";

/** Titre d'une partie de l'onglet, son explication et son bouton d'ajout. */
function Part({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[68ch]">
          <h2 id={id} className="text-[14.5px] leading-[normal] font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-ink-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Boutique, onglet « Retrait et livraison » (US-SHOP-03) : les lieux de retrait en main propre (l'acheteur y montre le
 * code QR de sa commande) et les modes de livraison à prix fixe (l'organisation expédie elle-même, puis saisit le
 * transporteur et le numéro de suivi).
 */
export function DeliveryView({
  orgSlug,
  canManage,
  symbol,
  points,
  methods,
}: {
  orgSlug: string;
  canManage: boolean;
  symbol: string;
  points: PickupPointItem[];
  methods: ShippingMethodItem[];
}) {
  const t = useTranslations("shop");
  const status = (active: boolean) =>
    active ? (
      <Badge tone="success" dot>
        {t("offered")}
      </Badge>
    ) : (
      <Badge tone="neutral">{t("notOffered")}</Badge>
    );
  const pointColumns: TableColumn<PickupPointItem>[] = [
    {
      key: "name",
      header: t("pickupName"),
      sortable: true,
      mobile: "title",
      cell: (p) => <b className="font-semibold">{p.name}</b>,
    },
    {
      key: "address",
      header: t("pickupAddress"),
      mobile: "subtitle",
      cell: (p) => (
        <span className="text-[13.5px] whitespace-pre-line">{p.address}</span>
      ),
    },
    {
      key: "instructions",
      header: t("pickupInstructions"),
      cell: (p) =>
        p.instructions ? (
          <span className="line-clamp-2 text-[13px] text-ink-body">
            {p.instructions}
          </span>
        ) : (
          <span className="text-[13px] text-ink-muted">-</span>
        ),
    },
    {
      key: "active",
      header: t("statusLabel"),
      mobile: "badge",
      sortValue: (p) => (p.active ? 0 : 1),
      cell: (p) => status(p.active),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: <span className="sr-only">{t("actions")}</span>,
            align: "right" as const,
            cell: (p: PickupPointItem) => (
              <span className="inline-flex items-center gap-3">
                <PickupPointDialog orgSlug={orgSlug} point={p} />
                <DeliveryCommand
                  orgSlug={orgSlug}
                  kind="pickup"
                  id={p.id}
                  active={p.active}
                  name={p.name}
                />
              </span>
            ),
          },
        ]
      : []),
  ];
  const methodColumns: TableColumn<ShippingMethodItem>[] = [
    {
      key: "name",
      header: t("shippingName"),
      sortable: true,
      mobile: "title",
      cell: (m) => <b className="font-semibold">{m.name}</b>,
    },
    {
      key: "price",
      header: t("price"),
      sortable: true,
      align: "right",
      sortValue: (m) => m.priceMinor,
      mobile: "subtitle",
      className: "tabular-nums whitespace-nowrap",
    },
    {
      key: "active",
      header: t("statusLabel"),
      mobile: "badge",
      sortValue: (m) => (m.active ? 0 : 1),
      cell: (m) => status(m.active),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: <span className="sr-only">{t("actions")}</span>,
            align: "right" as const,
            cell: (m: ShippingMethodItem) => (
              <span className="inline-flex items-center gap-3">
                <ShippingMethodDialog
                  orgSlug={orgSlug}
                  symbol={symbol}
                  method={m}
                />
                <DeliveryCommand
                  orgSlug={orgSlug}
                  kind="shipping"
                  id={m.id}
                  active={m.active}
                  name={m.name}
                />
              </span>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="grid gap-9">
      <Part
        id="pickup-points"
        title={t("pickupTitle")}
        description={t("pickupIntro")}
        action={canManage ? <PickupPointDialog orgSlug={orgSlug} /> : null}
      >
        <DataTable
          rows={points}
          columns={pointColumns}
          getRowId={(p) => p.id}
          caption={t("pickupTitle")}
          emptyState={{
            title: t("pickupEmptyTitle"),
            description: t("pickupEmptyBody"),
          }}
        />
      </Part>
      <Part
        id="shipping-methods"
        title={t("shippingTitle")}
        description={t("shippingIntro")}
        action={
          canManage ? (
            <ShippingMethodDialog orgSlug={orgSlug} symbol={symbol} />
          ) : null
        }
      >
        <DataTable
          rows={methods}
          columns={methodColumns}
          getRowId={(m) => m.id}
          caption={t("shippingTitle")}
          emptyState={{
            title: t("shippingEmptyTitle"),
            description: t("shippingEmptyBody"),
          }}
        />
      </Part>
    </div>
  );
}

/** Proposer de nouveau, ne plus proposer, ou supprimer (confirmé) un lieu de retrait ou un mode de livraison. */
function DeliveryCommand({
  orgSlug,
  kind,
  id,
  active,
  name,
}: {
  orgSlug: string;
  kind: "pickup" | "shipping";
  id: string;
  active: boolean;
  name: string;
}) {
  const t = useTranslations("shop");
  const [state, action, pending] = useActionState(
    deliveryCommandAction.bind(null, orgSlug, kind, id),
    null,
  );
  return (
    <form
      action={action}
      className="inline-flex items-center gap-3"
      onSubmit={(e) => {
        const command = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
          "value",
        );
        if (
          command === "delete" &&
          !window.confirm(t("deleteConfirm", { name }))
        )
          e.preventDefault();
      }}
    >
      <button
        type="submit"
        name="command"
        value={active ? "disable" : "enable"}
        className={LINK}
        disabled={pending}
      >
        {active ? t("stopOffering") : t("offer")}
      </button>
      <button
        type="submit"
        name="command"
        value="delete"
        className={LINK}
        disabled={pending}
      >
        {t("delete")}
      </button>
      <FormError state={state} />
    </form>
  );
}

/** Ajout (bouton) ou modification (lien d'une ligne) d'un lieu de retrait, dans une fenêtre. */
export function PickupPointDialog({
  orgSlug,
  point,
}: {
  orgSlug: string;
  point?: PickupPointItem;
}) {
  const t = useTranslations("shop");
  const [open, setOpen] = useState(false);
  const title = point ? t("pickupEdit") : t("pickupAdd");
  return (
    <>
      {point ? (
        <button type="button" className={LINK} onClick={() => setOpen(true)}>
          {t("edit")}
        </button>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          <PlusIcon />
          {title}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <PickupPointForm
          orgSlug={orgSlug}
          point={point}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

function PickupPointForm({
  orgSlug,
  point,
  onDone,
}: {
  orgSlug: string;
  point?: PickupPointItem;
  onDone: () => void;
}) {
  const t = useTranslations("shop");
  const tc = useTranslations("common");
  const { state, pending, formProps } = useActionForm(
    savePickupPointAction.bind(null, orgSlug, point?.id ?? null),
    null,
  );
  const error = useFieldError(state);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const id = (k: string) => `pickup-${point?.id ?? "new"}-${k}`;
  return (
    <form {...formProps} id={id("form")} className="grid gap-4" noValidate>
      <FormError state={state} />
      <Field
        label={t("pickupName")}
        htmlFor={id("name")}
        error={error("name")}
        required
      >
        <Input
          id={id("name")}
          name="name"
          maxLength={80}
          defaultValue={point?.name}
          placeholder={t("pickupNamePlaceholder")}
          required
          data-autofocus
        />
      </Field>
      <Field
        label={t("pickupAddress")}
        htmlFor={id("address")}
        error={error("address")}
        required
      >
        <textarea
          id={id("address")}
          name="address"
          rows={3}
          maxLength={300}
          defaultValue={point?.address}
          className={TEXTAREA_CLASS}
          required
        />
      </Field>
      <Field
        label={t("pickupInstructions")}
        htmlFor={id("instructions")}
        error={error("instructions")}
        hint={t("pickupInstructionsHint")}
      >
        <textarea
          id={id("instructions")}
          name="instructions"
          rows={2}
          maxLength={500}
          defaultValue={point?.instructions}
          className={TEXTAREA_CLASS}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {tc("cancel")}
        </Button>
        <Button
          type="submit"
          form={id("form")}
          disabled={pending}
          aria-busy={pending}
        >
          {point ? t("save") : t("add")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Ajout ou modification d'un mode de livraison (nom, prix fixe ; 0 : offerte), dans une fenêtre. */
export function ShippingMethodDialog({
  orgSlug,
  symbol,
  method,
}: {
  orgSlug: string;
  symbol: string;
  method?: ShippingMethodItem;
}) {
  const t = useTranslations("shop");
  const [open, setOpen] = useState(false);
  const title = method ? t("shippingEdit") : t("shippingAdd");
  return (
    <>
      {method ? (
        <button type="button" className={LINK} onClick={() => setOpen(true)}>
          {t("edit")}
        </button>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          <PlusIcon />
          {title}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <ShippingMethodForm
          orgSlug={orgSlug}
          symbol={symbol}
          method={method}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

function ShippingMethodForm({
  orgSlug,
  symbol,
  method,
  onDone,
}: {
  orgSlug: string;
  symbol: string;
  method?: ShippingMethodItem;
  onDone: () => void;
}) {
  const t = useTranslations("shop");
  const tc = useTranslations("common");
  const { state, pending, formProps } = useActionForm(
    saveShippingMethodAction.bind(null, orgSlug, method?.id ?? null),
    null,
  );
  const error = useFieldError(state);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const id = (k: string) => `shipping-${method?.id ?? "new"}-${k}`;
  return (
    <form {...formProps} id={id("form")} className="grid gap-4" noValidate>
      <FormError state={state} />
      <Field
        label={t("shippingName")}
        htmlFor={id("name")}
        error={error("name")}
        required
      >
        <Input
          id={id("name")}
          name="name"
          maxLength={80}
          defaultValue={method?.name}
          placeholder={t("shippingNamePlaceholder")}
          required
          data-autofocus
        />
      </Field>
      <Field
        label={`${t("price")} (${symbol})`}
        htmlFor={id("price")}
        error={error("price")}
        hint={t("shippingPriceHint")}
        required
      >
        <Input
          id={id("price")}
          name="price"
          inputMode="decimal"
          defaultValue={method?.priceInput}
          required
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {tc("cancel")}
        </Button>
        <Button
          type="submit"
          form={id("form")}
          disabled={pending}
          aria-busy={pending}
        >
          {method ? t("save") : t("add")}
        </Button>
      </DialogFooter>
    </form>
  );
}
