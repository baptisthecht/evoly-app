"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { SavedNote, SwitchRow } from "@/components/ui/Controls";
import { DialogFooter } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import {
  createOptionAction,
  optionCommandAction,
  updateOptionAction,
} from "../../actions";

export type Initial = {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: string;
  maxPerOrder: string;
  standalone: boolean;
};

/** Ajout ou modification d'une option (section 9.29), dans une fenêtre : les boutons dans son pied. */
export function OptionForm({
  orgSlug,
  eventId,
  symbol,
  option,
  onDone,
}: {
  orgSlug: string;
  eventId: string;
  symbol: string;
  option?: Initial;
  /** Fermer la fenêtre (« Annuler »). */
  onDone?: () => void;
}) {
  const t = useTranslations("options");
  const tc = useTranslations("common");
  const action = option
    ? updateOptionAction.bind(null, orgSlug, eventId, option.id)
    : createOptionAction.bind(null, orgSlug, eventId);
  const { state, pending, formProps } = useActionForm(action, null);
  const error = useFieldError(state);
  const p = option ? `option-${option.id}` : "option-new";
  const formId = `${p}-form`;
  return (
    <form id={formId} {...formProps} className="grid gap-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("name")} htmlFor={`${p}-name`} error={error("name")}>
          <Input
            id={`${p}-name`}
            name="name"
            maxLength={80}
            defaultValue={option?.name}
            placeholder={t("namePlaceholder")}
            required
          />
        </Field>
        <Field
          label={`${t("price")} (${symbol})`}
          htmlFor={`${p}-price`}
          error={error("price")}
        >
          <Input
            id={`${p}-price`}
            name="price"
            inputMode="decimal"
            defaultValue={option?.price}
            required
          />
        </Field>
        <Field
          label={t("stock")}
          htmlFor={`${p}-stock`}
          hint={t("stockHint")}
          error={error("stock")}
        >
          <Input
            id={`${p}-stock`}
            name="stock"
            inputMode="numeric"
            defaultValue={option?.stock}
          />
        </Field>
        <Field
          label={t("maxPerOrder")}
          htmlFor={`${p}-max`}
          error={error("maxPerOrder")}
        >
          <Input
            id={`${p}-max`}
            name="maxPerOrder"
            inputMode="numeric"
            defaultValue={option?.maxPerOrder ?? "10"}
          />
        </Field>
      </div>
      <Field
        label={t("description")}
        htmlFor={`${p}-desc`}
        error={error("description")}
      >
        <Input
          id={`${p}-desc`}
          name="description"
          maxLength={300}
          defaultValue={option?.description}
        />
      </Field>
      <SwitchRow
        name="standalone"
        defaultChecked={option?.standalone ?? false}
        label={t("standalone")}
        hint={t("standaloneHint")}
      />
      {/* refonte A3 (maquette « Nouveau tarif ») : les boutons dans le pied de la fenêtre */}
      <DialogFooter>
        {state?.ok ? (
          <span className="mr-auto">
            <SavedNote id={`${p}-saved`}>{t("saved")}</SavedNote>
          </span>
        ) : null}
        {onDone ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            {tc("cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          form={formId}
          variant="primary"
          disabled={pending}
          aria-busy={pending}
        >
          {option ? t("save") : t("add")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Retirer une option de la vente, ou l'y remettre. */
export function OptionCommand({
  orgSlug,
  eventId,
  optionId,
  command,
  label,
}: {
  orgSlug: string;
  eventId: string;
  optionId: string;
  command: "activate" | "deactivate";
  label: string;
}) {
  const [, action, pending] = useActionState(
    optionCommandAction.bind(null, orgSlug, eventId, optionId, command),
    null,
  );
  return (
    <form action={action} className="contents">
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
