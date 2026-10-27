"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import {
  FormError,
  SubmitButton,
  useActionForm,
  useFieldError,
} from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

/** Ajout ou modification d'une option (section 9.29). */
export function OptionForm({
  orgSlug,
  eventId,
  symbol,
  option,
  bare = false,
}: {
  orgSlug: string;
  eventId: string;
  symbol: string;
  option?: Initial;
  /** Dans une fenêtre : le formulaire seul (la fenêtre a son cadre et son titre). */
  bare?: boolean;
}) {
  const t = useTranslations("options");
  const action = option
    ? updateOptionAction.bind(null, orgSlug, eventId, option.id)
    : createOptionAction.bind(null, orgSlug, eventId);
  const { state, pending, formProps } = useActionForm(action, null);
  const error = useFieldError(state);
  const p = option ? `option-${option.id}` : "option-new";
  const form = (
    <form {...formProps} className="grid gap-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
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
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="standalone"
          defaultChecked={option?.standalone ?? false}
          className="mt-1 size-5 accent-[var(--ink)]"
        />
        <span>
          <span className="font-semibold">{t("standalone")}</span>
          <span className="block text-sm text-ink-muted">
            {t("standaloneHint")}
          </span>
        </span>
      </label>
      {state?.ok ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("saved")}
        </p>
      ) : null}
      <div>
        <SubmitButton pending={pending} className="w-full sm:w-auto">
          {option ? t("save") : t("add")}
        </SubmitButton>
      </div>
    </form>
  );
  if (bare) return form;
  if (option) return <div className="mt-3">{form}</div>;
  return (
    <Card className="grid gap-4">
      <h2 className="font-display text-xl">{t("newTitle")}</h2>
      {form}
    </Card>
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
