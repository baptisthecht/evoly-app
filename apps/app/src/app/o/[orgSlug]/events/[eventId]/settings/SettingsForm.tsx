"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { EventFields, type EventFieldValues } from "@/components/events/EventFields";
import { FormError, useFieldError } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/Field";
import { saveEventSettingsAction } from "../../actions";

export interface SettingsValues extends EventFieldValues {
  capacity: string;
  maxTicketsPerOrder: number;
  maxTicketsPerBuyer?: number | null;
  version?: string;
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  hasAccessCode?: boolean;
  refundPolicy: "NON_REFUNDABLE" | "UNTIL_DEADLINE" | "ON_REQUEST" | "ALWAYS";
  refundDeadlineLocal: string;
  salesStartLocal: string;
  salesEndLocal: string;
  resaleEnabled: boolean;
  resaleCutoffHours: number;
  showResaleSection: boolean;
}

/** RG-EVT-01 : sauvegarde automatique après une seconde sans modification, avec indicateur. */
export function SettingsForm({ orgSlug, eventId, values, readOnly }: { orgSlug: string; eventId: string; values: SettingsValues; readOnly: boolean }) {
  const t = useTranslations("eventSettings");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState(saveEventSettingsAction.bind(null, orgSlug, eventId), null);
  const error = useFieldError(state);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [visibility, setVisibility] = useState<SettingsValues["visibility"]>(values.visibility);
  const [refundPolicy, setRefundPolicy] = useState(values.refundPolicy);
  const [resaleEnabled, setResaleEnabled] = useState(values.resaleEnabled);

  const schedule = () => {
    if (readOnly) return;
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!form.current) return;
      const data = new FormData(form.current);
      const hours = data.get("resaleCutoffHours");
      if (hours !== null) data.set("resaleCutoffMinutes", String(Math.round(Number(hours || 0) * 60)));
      startTransition(() => action(data));
      setDirty(false);
    }, 1000);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const status = pending ? tc("saving") : dirty ? t("unsaved") : state?.ok ? tc("saved") : state && !state.ok ? t("notSaved") : "";
  // RG-EVT-10 : version suivie d'une sauvegarde à l'autre ; avertissement si un autre membre a enregistré entre-temps
  const version = state?.ok ? state.data.version : values.version;
  const concurrent = state?.ok && state.data.concurrent;
  return (
    <form ref={form} onChange={schedule} onSubmit={(e) => e.preventDefault()} className="grid gap-10" noValidate aria-describedby="save-status">
      <input type="hidden" name="version" value={version ?? ""} />
      {concurrent ? (
        <p role="alert" className="rounded-lg bg-warning-soft px-5 py-4 text-sm font-semibold text-warning">
          {t("concurrentEdit")}
        </p>
      ) : null}
      <div className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-10 -mb-6 flex justify-end lg:top-4">
        <p id="save-status" role="status" className="rounded-full bg-surface-raised px-3 py-1 text-sm font-semibold shadow-sm ring-1 ring-line">
          {status || t("autosave")}
        </p>
      </div>
      <FormError state={state} />
      <fieldset disabled={readOnly} className="grid gap-10">
        <EventFields values={values} error={error} />

        <fieldset className="grid gap-5">
          <legend className="mb-1 font-display text-xl tracking-[var(--tracking-title)]">{t("sectionSales")}</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("capacity")} htmlFor="capacity" hint={t("capacityHint")} error={error("capacity")}>
              <Input id="capacity" name="capacity" type="number" min={1} inputMode="numeric" defaultValue={values.capacity} />
            </Field>
            <Field label={t("maxTicketsPerOrder")} htmlFor="maxTicketsPerOrder" error={error("maxTicketsPerOrder")}>
              <Input id="maxTicketsPerOrder" name="maxTicketsPerOrder" type="number" min={1} max={50} defaultValue={values.maxTicketsPerOrder} />
            </Field>
            <Field label={t("maxTicketsPerBuyer")} htmlFor="maxTicketsPerBuyer" hint={t("maxTicketsPerBuyerHint")} error={error("maxTicketsPerBuyer")}>
              <Input id="maxTicketsPerBuyer" name="maxTicketsPerBuyer" type="number" min={1} max={200} defaultValue={values.maxTicketsPerBuyer ?? ""} />
            </Field>
            <Field label={t("salesStart")} htmlFor="salesStartLocal" hint={t("salesStartHint")} error={error("salesStartLocal")}>
              <Input id="salesStartLocal" name="salesStartLocal" type="datetime-local" defaultValue={values.salesStartLocal} />
            </Field>
            <Field label={t("salesEnd")} htmlFor="salesEndLocal" hint={t("salesEndHint")} error={error("salesEndLocal")}>
              <Input id="salesEndLocal" name="salesEndLocal" type="datetime-local" defaultValue={values.salesEndLocal} />
            </Field>
          </div>
          <Field label={t("visibility")} htmlFor="visibility">
            <Select id="visibility" name="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as SettingsValues["visibility"])}>
              <option value="PUBLIC">{t("visibility_PUBLIC")}</option>
              <option value="UNLISTED">{t("visibility_UNLISTED")}</option>
              <option value="PRIVATE">{t("visibility_PRIVATE")}</option>
            </Select>
          </Field>
          {visibility === "PRIVATE" ? (
            <Field
              label={t("accessCode")}
              htmlFor="accessCode"
              hint={values.hasAccessCode ? t("accessCodeKeep") : t("accessCodeHint")}
              error={error("accessCode")}
            >
              <Input
                id="accessCode"
                name="accessCode"
                autoComplete="off"
                className="font-mono uppercase"
                maxLength={32}
                placeholder={values.hasAccessCode ? "••••••" : "GALA2026"}
              />
            </Field>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="mb-1 font-display text-xl tracking-[var(--tracking-title)]">{t("sectionRefunds")}</legend>
          <Field label={t("refundPolicy")} htmlFor="refundPolicy">
            <Select
              id="refundPolicy"
              name="refundPolicy"
              value={refundPolicy}
              onChange={(e) => setRefundPolicy(e.target.value as SettingsValues["refundPolicy"])}
            >
              {(["ON_REQUEST", "UNTIL_DEADLINE", "ALWAYS", "NON_REFUNDABLE"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`refund_${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          {refundPolicy === "UNTIL_DEADLINE" ? (
            <Field label={t("refundDeadline")} htmlFor="refundDeadlineLocal" error={error("refundDeadlineLocal")}>
              <Input id="refundDeadlineLocal" name="refundDeadlineLocal" type="datetime-local" defaultValue={values.refundDeadlineLocal} />
            </Field>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="mb-1 font-display text-xl tracking-[var(--tracking-title)]">{t("sectionResale")}</legend>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="resaleEnabled"
              checked={resaleEnabled}
              onChange={(e) => setResaleEnabled(e.target.checked)}
              className="size-5 accent-[var(--ink)]"
            />
            {t("resaleEnabled")}
          </label>
          <input type="hidden" name="resaleCutoffMinutes" value={values.resaleCutoffHours * 60} />
          {resaleEnabled ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("resaleCutoff")} htmlFor="resaleCutoffHours" hint={t("resaleCutoffHint")}>
                <Input id="resaleCutoffHours" name="resaleCutoffHours" type="number" min={0} max={168} step={0.5} defaultValue={values.resaleCutoffHours} />
              </Field>
              <label className="flex items-center gap-3 self-center">
                <input type="checkbox" name="showResaleSection" defaultChecked={values.showResaleSection} className="size-5 accent-[var(--ink)]" />
                {t("showResaleSection")}
              </label>
            </div>
          ) : (
            <input type="hidden" name="showResaleSection" value={values.showResaleSection ? "on" : ""} />
          )}
        </fieldset>
      </fieldset>
    </form>
  );
}
