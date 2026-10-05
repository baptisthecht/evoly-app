"use client";

import type { FeeTerms } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { saveTicketTypeAction, ticketCommandAction } from "../../actions";
import { PriceFields } from "./PriceFields";
import { TiersEditor, type TierRow } from "./TiersEditor";

export interface TicketTypeRow {
  id: string;
  name: string;
  description: string;
  price: string;
  priceMinor: number;
  quantity: string;
  quantitySold: number;
  minPerOrder: number;
  maxPerOrder: number;
  salesStartLocal: string;
  salesEndLocal: string;
  visibility: "VISIBLE" | "HIDDEN" | "CODE_ONLY";
  status: "ACTIVE" | "PAUSED" | "SOLD_OUT" | "ARCHIVED";
  isNominative: boolean;
  requireHolderEmail?: boolean;
  resaleAllowed: boolean;
  priceLocked: boolean;
  tiers: TierRow[];
}

const checkboxClass = "size-5 accent-[var(--ink)]";

function Command({
  orgSlug,
  eventId,
  id,
  command,
  label,
  variant = "ghost",
}: {
  orgSlug: string;
  eventId: string;
  id: string;
  command: "delete" | "pause" | "activate" | "archive" | "up" | "down";
  label: string;
  variant?: "ghost" | "secondary";
}) {
  const [state, action, pending] = useActionState(ticketCommandAction.bind(null, orgSlug, eventId, id, command), null);
  return (
    <form action={action} className="contents">
      <Button type="submit" size="sm" variant={variant} disabled={pending} aria-label={label}>
        {label}
      </Button>
      <FormError state={state} />
    </form>
  );
}

export function TicketTypeForm({
  orgSlug,
  eventId,
  row,
  terms,
  onDone,
}: {
  orgSlug: string;
  eventId: string;
  row: TicketTypeRow | null;
  terms: FeeTerms;
  onDone?: () => void;
}) {
  const t = useTranslations("tickets");
  const { state, pending, formProps } = useActionForm(saveTicketTypeAction.bind(null, orgSlug, eventId, row?.id ?? null), null);
  const error = useFieldError(state);
  const [price, setPrice] = useState(row?.price ?? "");
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  return (
    <form {...formProps} className="grid gap-5" noValidate>
      <FormError state={state} />
      <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label={t("name")} htmlFor={`name-${row?.id ?? "new"}`} error={error("name")}>
          <Input id={`name-${row?.id ?? "new"}`} name="name" defaultValue={row?.name ?? ""} maxLength={60} required />
        </Field>
        <Field label={t("quantity")} htmlFor={`quantity-${row?.id ?? "new"}`} hint={t("unlimited")} error={error("quantity")}>
          <Input
            id={`quantity-${row?.id ?? "new"}`}
            name="quantity"
            type="number"
            min={Math.max(1, row?.quantitySold ?? 1)}
            inputMode="numeric"
            defaultValue={row?.quantity ?? ""}
          />
        </Field>
      </div>
      <PriceFields
        id={`price-${row?.id ?? "new"}`}
        name="price"
        label={t("pricePaid")}
        hint={row?.priceLocked ? t("priceLocked") : t("priceHint")}
        error={error("price")}
        price={price}
        onPrice={setPrice}
        terms={terms}
        locked={row?.priceLocked}
      />
      <details className="rounded-md bg-surface-sunken px-4 py-3 [&[open]]:pb-4">
        <summary className="cursor-pointer font-semibold">{t("moreOptions")}</summary>
        <div className="mt-4 grid gap-5">
          <Field label={t("description")} htmlFor={`description-${row?.id ?? "new"}`}>
            <Input id={`description-${row?.id ?? "new"}`} name="description" defaultValue={row?.description ?? ""} maxLength={200} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("minPerOrder")} htmlFor={`min-${row?.id ?? "new"}`} error={error("minPerOrder")}>
              <Input id={`min-${row?.id ?? "new"}`} name="minPerOrder" type="number" min={1} max={50} defaultValue={row?.minPerOrder ?? 1} />
            </Field>
            <Field label={t("maxPerOrder")} htmlFor={`max-${row?.id ?? "new"}`} error={error("maxPerOrder")}>
              <Input id={`max-${row?.id ?? "new"}`} name="maxPerOrder" type="number" min={1} max={50} defaultValue={row?.maxPerOrder ?? 10} />
            </Field>
            <Field label={t("salesStart")} htmlFor={`ss-${row?.id ?? "new"}`}>
              <Input id={`ss-${row?.id ?? "new"}`} name="salesStartLocal" type="datetime-local" defaultValue={row?.salesStartLocal ?? ""} />
            </Field>
            <Field label={t("salesEnd")} htmlFor={`se-${row?.id ?? "new"}`}>
              <Input id={`se-${row?.id ?? "new"}`} name="salesEndLocal" type="datetime-local" defaultValue={row?.salesEndLocal ?? ""} />
            </Field>
          </div>
          <Field label={t("visibility")} htmlFor={`vis-${row?.id ?? "new"}`}>
            <Select id={`vis-${row?.id ?? "new"}`} name="visibility" defaultValue={row?.visibility ?? "VISIBLE"}>
              {(["VISIBLE", "HIDDEN", "CODE_ONLY"] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`visibility_${v}`)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="isNominative" defaultChecked={row?.isNominative ?? false} className={checkboxClass} />
            {t("nominative")}
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="requireHolderEmail" defaultChecked={row?.requireHolderEmail ?? false} className={checkboxClass} />
            {t("requireHolderEmail")}
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="resaleAllowed" defaultChecked={row?.resaleAllowed ?? true} className={checkboxClass} />
            {t("resaleAllowed")}
          </label>
        </div>
      </details>
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} className="w-full sm:w-auto">
          {row ? t("save") : t("addTicketType")}
        </SubmitButton>
        {onDone ? (
          <Button type="button" variant="ghost" size="lg" onClick={onDone}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function TicketTypeCard({
  orgSlug,
  eventId,
  row,
  terms,
  currency,
  index,
  count,
  tiersEnabled,
  tiersLocked,
}: {
  orgSlug: string;
  eventId: string;
  row: TicketTypeRow;
  terms: FeeTerms;
  currency: string;
  index: number;
  count: number;
  tiersEnabled: boolean;
  tiersLocked: boolean;
}) {
  const t = useTranslations("tickets");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState(false);
  const statusTone = row.status === "ACTIVE" ? "success" : row.status === "PAUSED" ? "warning" : "neutral";
  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-lg tracking-[var(--tracking-title)]">{row.name}</h3>
            <Badge tone={statusTone}>{t(`status_${row.status}`)}</Badge>
            {row.visibility !== "VISIBLE" ? <Badge>{t(`visibility_${row.visibility}`)}</Badge> : null}
          </div>
          <p className="text-sm text-ink-muted">
            {row.priceMinor === 0 ? t("free") : formatMoney(row.priceMinor, currency, locale)} ·{" "}
            {row.quantity ? t("soldOf", { sold: row.quantitySold, total: Number(row.quantity) }) : t("soldUnlimited", { sold: row.quantitySold })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {index > 0 ? <Command orgSlug={orgSlug} eventId={eventId} id={row.id} command="up" label={t("moveUp")} /> : null}
          {index < count - 1 ? <Command orgSlug={orgSlug} eventId={eventId} id={row.id} command="down" label={t("moveDown")} /> : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? t("close") : t("edit")}
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="grid gap-5 border-t border-line pt-5">
          <TicketTypeForm orgSlug={orgSlug} eventId={eventId} row={row} terms={terms} onDone={() => setEditing(false)} />
          <TiersEditor
            orgSlug={orgSlug}
            eventId={eventId}
            ticketTypeId={row.id}
            initial={row.tiers}
            enabled={tiersEnabled}
            locked={tiersLocked}
            terms={terms}
          />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {row.status === "ACTIVE" ? (
              <Command orgSlug={orgSlug} eventId={eventId} id={row.id} command="pause" label={t("pause")} variant="secondary" />
            ) : null}
            {row.status === "PAUSED" || row.status === "ARCHIVED" ? (
              <Command orgSlug={orgSlug} eventId={eventId} id={row.id} command="activate" label={t("activate")} variant="secondary" />
            ) : null}
            {row.quantitySold > 0 && row.status !== "ARCHIVED" ? (
              <Command orgSlug={orgSlug} eventId={eventId} id={row.id} command="archive" label={t("archive")} variant="secondary" />
            ) : null}
            {row.quantitySold === 0 ? (
              <Command orgSlug={orgSlug} eventId={eventId} id={row.id} command="delete" label={t("delete")} variant="secondary" />
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
