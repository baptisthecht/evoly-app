"use client";

import { useTranslations } from "next-intl";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { SavedNote } from "@/components/ui/Controls";
import { Field, Input, TEXTAREA_CLASS } from "@/components/ui/Field";
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
  type: {
    id: string;
    groupSize: number;
    tableLabels: string[];
    locked: boolean;
    includedOptions: Array<{ optionId: string; quantity: number }>;
  };
  options: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("tables");
  const { state, pending, formProps } = useActionForm(
    saveTablesAction.bind(null, orgSlug, eventId, type.id),
    null,
  );
  const p = `table-${type.id}`;
  // refonte A3 (maquette « Réglages de l'événement ») : champs de 40 px, le nombre sur une demi-largeur (« .two »),
  // le bouton à sa taille
  return (
    <form {...formProps} className="grid gap-3.5" noValidate>
      <FormError state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t("groupSize")}
          htmlFor={`${p}-size`}
          hint={type.locked ? t("locked") : t("groupSizeHint")}
        >
          <Input
            id={`${p}-size`}
            name="groupSize"
            type="number"
            min={1}
            max={30}
            defaultValue={type.groupSize}
            readOnly={type.locked}
          />
        </Field>
      </div>
      <Field label={t("labels")} htmlFor={`${p}-labels`} hint={t("labelsHint")}>
        <textarea
          id={`${p}-labels`}
          name="tableLabels"
          rows={4}
          defaultValue={type.tableLabels.join("\n")}
          className={TEXTAREA_CLASS}
        />
      </Field>
      {options.length ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-[length:var(--label-size)] [font-weight:var(--label-weight)]">
            {t("included")}
          </legend>
          {options.map((o) => (
            <label
              key={o.id}
              className="flex items-center justify-between gap-3"
            >
              <span>{o.name}</span>
              {/* le champ prend toute la largeur de son cadre : 80 px */}
              <span className="w-20 shrink-0">
                <Input
                  type="number"
                  name={`include_${o.id}`}
                  min={0}
                  max={100}
                  defaultValue={
                    type.includedOptions.find((i) => i.optionId === o.id)
                      ?.quantity ?? 0
                  }
                  aria-label={o.name}
                />
              </span>
            </label>
          ))}
          <p className="text-[length:var(--hint-size)] text-ink-muted">
            {t("includedHint")}
          </p>
        </fieldset>
      ) : (
        <p className="text-[13px] text-ink-muted">{t("noOptions")}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{t("save")}</SubmitButton>
        {state?.ok ? (
          <SavedNote id={`${p}-saved`}>{t("saved")}</SavedNote>
        ) : null}
      </div>
    </form>
  );
}
