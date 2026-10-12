"use client";

import { useTranslations } from "next-intl";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { Field, Input } from "@/components/ui/Field";
import { saveTablesAction } from "../../actions";

/** Réglages de forfait d'un tarif (section 9.31) : personnes par table, noms des tables, consommations comprises. */
export function TableForm({
  orgSlug,
  eventId,
  type,
  options,
}: {
  orgSlug: string;
  eventId: string;
  type: { id: string; groupSize: number; tableLabels: string[]; locked: boolean; includedOptions: Array<{ optionId: string; quantity: number }> };
  options: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("tables");
  const { state, pending, formProps } = useActionForm(saveTablesAction.bind(null, orgSlug, eventId, type.id), null);
  const p = `table-${type.id}`;
  return (
    <form {...formProps} className="grid gap-4" noValidate>
      <FormError state={state} />
      <Field label={t("groupSize")} htmlFor={`${p}-size`} hint={type.locked ? t("locked") : t("groupSizeHint")}>
        <Input id={`${p}-size`} name="groupSize" type="number" min={1} max={30} defaultValue={type.groupSize} readOnly={type.locked} />
      </Field>
      <label className="grid gap-1 text-sm" htmlFor={`${p}-labels`}>
        <span className="font-semibold">{t("labels")}</span>
        <span className="text-ink-muted">{t("labelsHint")}</span>
        <textarea
          id={`${p}-labels`}
          name="tableLabels"
          rows={4}
          defaultValue={type.tableLabels.join("\n")}
          className="w-full rounded-xl bg-surface-raised p-3 ring-1 ring-line-strong"
        />
      </label>
      {options.length ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">{t("included")}</legend>
          <p className="text-sm text-ink-muted">{t("includedHint")}</p>
          {options.map((o) => (
            <label key={o.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{o.name}</span>
              <input
                type="number"
                name={`include_${o.id}`}
                min={0}
                max={100}
                defaultValue={type.includedOptions.find((i) => i.optionId === o.id)?.quantity ?? 0}
                aria-label={o.name}
                className="h-10 w-20 rounded-xl bg-surface-raised px-3 ring-1 ring-line-strong"
              />
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-ink-muted">{t("noOptions")}</p>
      )}
      {state?.ok ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("saved")}
        </p>
      ) : null}
      <div>
        <SubmitButton pending={pending}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
