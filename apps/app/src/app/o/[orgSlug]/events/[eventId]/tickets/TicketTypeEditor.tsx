"use client";

import {
  estimateBankFee,
  organizerNet,
  parseMajorToMinor,
  ticketCommission,
  type FeeTerms,
} from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { ExampleNote, SwitchRow } from "@/components/ui/Controls";
import { DialogFooter } from "@/components/ui/Dialog";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { saveTicketTypeAction, ticketCommandAction } from "../../actions";
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
  maxPerBuyer?: number | null;
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

export function TicketTypeCommand(props: Parameters<typeof Command>[0]) {
  return <Command {...props} />;
}

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
  const [state, action, pending] = useActionState(
    ticketCommandAction.bind(null, orgSlug, eventId, id, command),
    null,
  );
  return (
    <form action={action} className="contents">
      <Button
        type="submit"
        size="sm"
        variant={variant}
        disabled={pending}
        aria-label={label}
      >
        {label}
      </Button>
      <FormError state={state} />
    </form>
  );
}

/**
 * Formulaire d'un tarif (refonte A3, maquette « Nouveau tarif ») : le nom, le prix et le nombre de places, la période de
 * vente, l'interrupteur « Limiter par personne », puis une phrase d'exemple qui suit la saisie (ce que verront les
 * acheteurs et ce que l'organisateur perçoit). Les réglages plus rares restent repliés sous « Plus d'options ». Les
 * boutons vont dans le pied de la fenêtre (DialogFooter).
 */
export function TicketTypeForm({
  orgSlug,
  eventId,
  row,
  terms,
  eventDay,
  onDone,
}: {
  orgSlug: string;
  eventId: string;
  row: TicketTypeRow | null;
  terms: FeeTerms;
  /** Jour de l'événement (AAAA-MM-JJ, heure locale) : « en vente le soir même ». */
  eventDay?: string;
  onDone?: () => void;
}) {
  const t = useTranslations("tickets");
  const locale = useLocale() as Locale;
  const { state, pending, formProps } = useActionForm(
    saveTicketTypeAction.bind(null, orgSlug, eventId, row?.id ?? null),
    null,
  );
  const error = useFieldError(state);
  const key = row?.id ?? "new";
  const formId = `ticket-type-${key}`;
  const [name, setName] = useState(row?.name ?? "");
  const [price, setPrice] = useState(row?.price ?? "");
  const [start, setStart] = useState(row?.salesStartLocal ?? "");
  const [end, setEnd] = useState(row?.salesEndLocal ?? "");
  const [limit, setLimit] = useState(row?.maxPerBuyer != null);
  const [perBuyer, setPerBuyer] = useState(String(row?.maxPerBuyer ?? 4));
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  const minor = parseMajorToMinor(price);
  const money = (v: number) => formatMoney(v, terms.currency, locale);
  // « 1er oct. » en français, comme le champ de date (formatShortDate de @evoly/i18n)
  const day = (local: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })
      .formatToParts(new Date(local))
      .map((p) =>
        p.type === "day" && locale.startsWith("fr") && p.value === "1"
          ? "1er"
          : p.value,
      )
      .join("");
  const time = (local: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(local));
  const when = (local: string) => `${day(local)}, ${time(local)}`;
  const window =
    start && end
      ? start.slice(0, 10) === end.slice(0, 10)
        ? start.slice(0, 10) === eventDay
          ? t("exampleSameDay", { from: time(start), to: time(end) })
          : t("exampleDay", {
              day: day(start),
              from: time(start),
              to: time(end),
            })
        : t("exampleRange", { from: when(start), to: when(end) })
      : start
        ? t("exampleFrom", { from: when(start) })
        : end
          ? t("exampleUntil", { to: when(end) })
          : "";
  const label = [
    name.trim() || t("name"),
    minor == null ? null : minor === 0 ? t("free") : money(minor),
  ]
    .filter(Boolean)
    .join(", ");
  const fees =
    minor == null
      ? null
      : minor === 0
        ? t("exampleFree")
        : t("exampleFeesShort");
  const commission = minor ? ticketCommission(minor, terms) : 0;
  const bankFee = minor ? estimateBankFee(minor) : 0;
  return (
    <form {...formProps} id={formId} className="grid gap-4" noValidate>
      <FormError state={state} />
      <Field label={t("name")} htmlFor={`name-${key}`} error={error("name")}>
        <Input
          id={`name-${key}`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          data-autofocus
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t("price")}
          htmlFor={`price-${key}`}
          hint={row?.priceLocked ? t("priceLocked") : undefined}
          error={error("price")}
        >
          <div className="relative">
            <Input
              id={`price-${key}`}
              name="price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              readOnly={row?.priceLocked}
              required
              className="pr-8"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-[13px] -translate-y-1/2 text-ink-muted"
            >
              {currencySymbol(terms.currency, locale)}
            </span>
          </div>
        </Field>
        <Field
          label={t("quantity")}
          htmlFor={`quantity-${key}`}
          error={error("quantity")}
        >
          <Input
            id={`quantity-${key}`}
            name="quantity"
            type="number"
            min={Math.max(1, row?.quantitySold ?? 1)}
            inputMode="numeric"
            defaultValue={row?.quantity ?? ""}
            placeholder={t("unlimited")}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("salesStart")} htmlFor={`ss-${key}`}>
          <DateTimeField
            id={`ss-${key}`}
            name="salesStartLocal"
            locale={locale}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label={t("salesEnd")} htmlFor={`se-${key}`}>
          <DateTimeField
            id={`se-${key}`}
            name="salesEndLocal"
            locale={locale}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-start gap-3">
        <input
          id={`limit-${key}`}
          type="checkbox"
          role="switch"
          checked={limit}
          onChange={(e) => setLimit(e.target.checked)}
          aria-describedby={`limit-${key}-hint`}
        />
        <span className="min-w-0">
          <label
            htmlFor={`limit-${key}`}
            className="block cursor-pointer text-[14px] font-medium"
          >
            {t("limitPerBuyer")}
          </label>
          <small
            id={`limit-${key}-hint`}
            className="text-[12.5px] text-ink-muted"
          >
            {limit ? (
              <>
                <input
                  name="maxPerBuyer"
                  type="number"
                  min={1}
                  max={1000}
                  inputMode="numeric"
                  value={perBuyer}
                  onChange={(e) => setPerBuyer(e.target.value)}
                  aria-label={t("perBuyerLabel")}
                  className="h-[1.2em] min-w-[1ch] bg-transparent p-0 align-baseline text-[12.5px] leading-none text-ink-muted [appearance:textfield] [field-sizing:content] hover:shadow-[inset_0_-1px_0_var(--line-strong)] focus:text-ink focus:shadow-[inset_0_-1px_0_var(--ink-strong)] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                />{" "}
                {t("perBuyerSuffix")}
              </>
            ) : (
              <>
                <input type="hidden" name="maxPerBuyer" value="" />
                {t("maxPerBuyerHint")}
              </>
            )}
          </small>
          {error("maxPerBuyer") ? (
            <small role="alert" className="block text-[12.5px] text-danger">
              {error("maxPerBuyer")}
            </small>
          ) : null}
        </span>
      </div>
      <ExampleNote>
        {t("example", { label, window })}
        {fees ? ` ${fees}` : null}
      </ExampleNote>
      {/* les réglages plus rares (absents de la maquette) : dépliés depuis « Plus d'options », dans le pied de la fenêtre */}
      {more ? (
        <div className="grid gap-4 border-t border-line pt-4">
          {minor ? (
            <p className="text-[13px]" aria-live="polite">
              <b className="font-medium">
                {t("youReceive", {
                  amount: money(organizerNet(minor, commission, bankFee)),
                })}
              </b>
              <br />
              <small className="text-[12.5px] text-ink-muted">
                {t("feesDetail", {
                  commission: money(commission),
                  bankFee: money(bankFee),
                })}
              </small>
            </p>
          ) : null}
          <Field label={t("description")} htmlFor={`description-${key}`}>
            <Input
              id={`description-${key}`}
              name="description"
              defaultValue={row?.description ?? ""}
              maxLength={200}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("minPerOrder")}
              htmlFor={`min-${key}`}
              error={error("minPerOrder")}
            >
              <Input
                id={`min-${key}`}
                name="minPerOrder"
                type="number"
                min={1}
                max={50}
                defaultValue={row?.minPerOrder ?? 1}
              />
            </Field>
            <Field
              label={t("maxPerOrder")}
              htmlFor={`max-${key}`}
              error={error("maxPerOrder")}
            >
              <Input
                id={`max-${key}`}
                name="maxPerOrder"
                type="number"
                min={1}
                max={50}
                defaultValue={row?.maxPerOrder ?? 10}
              />
            </Field>
          </div>
          <Field label={t("visibility")} htmlFor={`vis-${key}`}>
            <Select
              id={`vis-${key}`}
              name="visibility"
              defaultValue={row?.visibility ?? "VISIBLE"}
            >
              {(["VISIBLE", "HIDDEN", "CODE_ONLY"] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`visibility_${v}`)}
                </option>
              ))}
            </Select>
          </Field>
          <SwitchRow
            name="isNominative"
            defaultChecked={row?.isNominative ?? false}
            label={t("nominative")}
          />
          <SwitchRow
            name="requireHolderEmail"
            defaultChecked={row?.requireHolderEmail ?? false}
            label={t("requireHolderEmail")}
          />
          <SwitchRow
            name="resaleAllowed"
            defaultChecked={row?.resaleAllowed ?? true}
            label={t("resaleAllowed")}
          />
        </div>
      ) : (
        <>
          <input
            type="hidden"
            name="description"
            value={row?.description ?? ""}
          />
          <input
            type="hidden"
            name="minPerOrder"
            value={row?.minPerOrder ?? 1}
          />
          <input
            type="hidden"
            name="maxPerOrder"
            value={row?.maxPerOrder ?? 10}
          />
          <input
            type="hidden"
            name="visibility"
            value={row?.visibility ?? "VISIBLE"}
          />
          {(row?.isNominative ?? false) ? (
            <input type="hidden" name="isNominative" value="on" />
          ) : null}
          {(row?.requireHolderEmail ?? false) ? (
            <input type="hidden" name="requireHolderEmail" value="on" />
          ) : null}
          {(row?.resaleAllowed ?? true) ? (
            <input type="hidden" name="resaleAllowed" value="on" />
          ) : null}
        </>
      )}
      <DialogFooter>
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="mr-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={more ? "size-3.5 rotate-90" : "size-3.5"}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          {t("moreOptions")}
        </button>
        {onDone ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            {t("cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          form={formId}
          variant="primary"
          disabled={pending}
          aria-busy={pending}
        >
          {row ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Le symbole de la devise (« € »), dans la langue de l'interface. */
function currencySymbol(currency: string, locale: string) {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
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
  const statusTone =
    row.status === "ACTIVE"
      ? "success"
      : row.status === "PAUSED"
        ? "warning"
        : "neutral";
  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[0.9375rem] font-semibold">
              {row.name}
            </h3>
            <Badge tone={statusTone}>{t(`status_${row.status}`)}</Badge>
            {row.visibility !== "VISIBLE" ? (
              <Badge>{t(`visibility_${row.visibility}`)}</Badge>
            ) : null}
          </div>
          <p className="text-sm text-ink-muted">
            {row.priceMinor === 0
              ? t("free")
              : formatMoney(row.priceMinor, currency, locale)}{" "}
            ·{" "}
            {row.quantity
              ? t("soldOf", {
                  sold: row.quantitySold,
                  total: Number(row.quantity),
                })
              : t("soldUnlimited", { sold: row.quantitySold })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {index > 0 ? (
            <Command
              orgSlug={orgSlug}
              eventId={eventId}
              id={row.id}
              command="up"
              label={t("moveUp")}
            />
          ) : null}
          {index < count - 1 ? (
            <Command
              orgSlug={orgSlug}
              eventId={eventId}
              id={row.id}
              command="down"
              label={t("moveDown")}
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            {editing ? t("close") : t("edit")}
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="grid gap-5 border-t border-line pt-5">
          <TicketTypeEditPanel
            orgSlug={orgSlug}
            eventId={eventId}
            row={row}
            terms={terms}
            tiersEnabled={tiersEnabled}
            tiersLocked={tiersLocked}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : null}
    </Card>
  );
}

/** L'édition complète d'un tarif : le formulaire, les paliers de prix, puis pause, remise en vente, archivage, suppression. */
export function TicketTypeEditPanel({
  orgSlug,
  eventId,
  row,
  terms,
  tiersEnabled,
  tiersLocked,
  onDone,
  position,
  eventDay,
}: {
  orgSlug: string;
  eventId: string;
  row: TicketTypeRow;
  terms: FeeTerms;
  eventDay?: string;
  tiersEnabled: boolean;
  tiersLocked: boolean;
  onDone: () => void;
  /** Place du tarif dans la billetterie : « Monter » et « Descendre » (refonte A3 : plus de colonne d'actions). */
  position?: { first: boolean; last: boolean };
}) {
  const t = useTranslations("tickets");
  return (
    <div className="grid gap-5">
      <TicketTypeForm
        orgSlug={orgSlug}
        eventId={eventId}
        row={row}
        terms={terms}
        eventDay={eventDay}
        onDone={onDone}
      />
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
        {position && !position.first ? (
          <Command
            orgSlug={orgSlug}
            eventId={eventId}
            id={row.id}
            command="up"
            label={t("moveUp")}
            variant="secondary"
          />
        ) : null}
        {position && !position.last ? (
          <Command
            orgSlug={orgSlug}
            eventId={eventId}
            id={row.id}
            command="down"
            label={t("moveDown")}
            variant="secondary"
          />
        ) : null}
        {row.status === "ACTIVE" ? (
          <Command
            orgSlug={orgSlug}
            eventId={eventId}
            id={row.id}
            command="pause"
            label={t("pause")}
            variant="secondary"
          />
        ) : null}
        {row.status === "PAUSED" || row.status === "ARCHIVED" ? (
          <Command
            orgSlug={orgSlug}
            eventId={eventId}
            id={row.id}
            command="activate"
            label={t("activate")}
            variant="secondary"
          />
        ) : null}
        {row.quantitySold > 0 && row.status !== "ARCHIVED" ? (
          <Command
            orgSlug={orgSlug}
            eventId={eventId}
            id={row.id}
            command="archive"
            label={t("archive")}
            variant="secondary"
          />
        ) : null}
        {row.quantitySold === 0 ? (
          <Command
            orgSlug={orgSlug}
            eventId={eventId}
            id={row.id}
            command="delete"
            label={t("delete")}
            variant="secondary"
          />
        ) : null}
      </div>
    </div>
  );
}
