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
import { SavedNote, SettingsRow } from "@/components/ui/Controls";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  ambassadorCommandAction,
  ambassadorPromoAction,
  createAmbassadorAction,
} from "../../actions";

/** Ajout d'un ambassadeur (section 9.28). */
export function AmbassadorForm({
  orgSlug,
  eventId,
}: {
  orgSlug: string;
  eventId: string;
}) {
  const t = useTranslations("ambassadors");
  const { state, pending, formProps } = useActionForm(
    createAmbassadorAction.bind(null, orgSlug, eventId),
    null,
  );
  const error = useFieldError(state);
  // refonte A3 (maquette « Réglages de l'événement ») : une rangée, le titre à gauche, les champs à droite
  return (
    <SettingsRow title={t("newTitle")}>
      <form {...formProps} className="grid gap-3.5" noValidate>
        <FormError state={state} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("name")} htmlFor="amb-name" error={error("name")}>
            <Input id="amb-name" name="name" maxLength={80} required />
          </Field>
          <Field
            label={t("email")}
            htmlFor="amb-email"
            hint={t("emailHint")}
            error={error("email")}
          >
            <Input id="amb-email" name="email" type="email" maxLength={200} />
          </Field>
          <Field
            label={t("goal")}
            htmlFor="amb-goal"
            hint={t("goalHint")}
            error={error("goal")}
          >
            <Input id="amb-goal" name="goal" inputMode="numeric" />
          </Field>
          <Field
            label={t("reward")}
            htmlFor="amb-reward"
            hint={t("rewardHint")}
            error={error("reward")}
          >
            <Input id="amb-reward" name="reward" maxLength={200} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending}>{t("add")}</SubmitButton>
          {state?.ok ? (
            <SavedNote id="ambassador-saved">{t("saved")}</SavedNote>
          ) : null}
        </div>
      </form>
    </SettingsRow>
  );
}

/** Réduction associée au code d'un ambassadeur (RG-AMB-01) : son code devient aussi un code promo. */
export function AmbassadorPromoForm({
  orgSlug,
  eventId,
  id,
  code,
}: {
  orgSlug: string;
  eventId: string;
  id: string;
  code: string;
}) {
  const t = useTranslations("ambassadors");
  const { state, pending, formProps } = useActionForm(
    ambassadorPromoAction.bind(null, orgSlug, eventId, id),
    null,
  );
  const error = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-2" noValidate>
      <FormError state={state} />
      <p className="text-[13px] text-ink-muted">{t("promoHint", { code })}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("promoType")} htmlFor={`promo-type-${id}`}>
          <Select
            id={`promo-type-${id}`}
            name="discountType"
            defaultValue="PERCENT"
          >
            <option value="PERCENT">{t("promoPercent")}</option>
            <option value="AMOUNT">{t("promoAmount")}</option>
          </Select>
        </Field>
        <Field
          label={t("promoValue")}
          htmlFor={`promo-value-${id}`}
          error={error("value")}
        >
          <Input
            id={`promo-value-${id}`}
            name="value"
            inputMode="decimal"
            maxLength={12}
            required
          />
        </Field>
        <SubmitButton
          pending={pending}
          variant="secondary"
          className="shrink-0"
        >
          {t("promoAdd")}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Désactiver ou réactiver un ambassadeur, ou retirer sa réduction. */
export function AmbassadorCommand({
  orgSlug,
  eventId,
  id,
  command,
  label,
}: {
  orgSlug: string;
  eventId: string;
  id: string;
  command: "activate" | "deactivate" | "removePromo";
  label: string;
}) {
  const [, action, pending] = useActionState(
    ambassadorCommandAction.bind(null, orgSlug, eventId, id, command),
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
