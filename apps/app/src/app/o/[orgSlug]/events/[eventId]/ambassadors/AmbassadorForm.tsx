"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { ambassadorCommandAction, ambassadorPromoAction, createAmbassadorAction } from "../../actions";

/** Ajout d'un ambassadeur (section 9.28). */
export function AmbassadorForm({ orgSlug, eventId }: { orgSlug: string; eventId: string }) {
  const t = useTranslations("ambassadors");
  const { state, pending, formProps } = useActionForm(createAmbassadorAction.bind(null, orgSlug, eventId), null);
  const error = useFieldError(state);
  return (
    <Card className="grid gap-4">
      <h2 className="font-display text-xl">{t("newTitle")}</h2>
      <form {...formProps} className="grid gap-4" noValidate>
        <FormError state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")} htmlFor="amb-name" error={error("name")}>
            <Input id="amb-name" name="name" maxLength={80} required />
          </Field>
          <Field label={t("email")} htmlFor="amb-email" hint={t("emailHint")} error={error("email")}>
            <Input id="amb-email" name="email" type="email" maxLength={200} />
          </Field>
          <Field label={t("goal")} htmlFor="amb-goal" hint={t("goalHint")} error={error("goal")}>
            <Input id="amb-goal" name="goal" inputMode="numeric" />
          </Field>
          <Field label={t("reward")} htmlFor="amb-reward" hint={t("rewardHint")} error={error("reward")}>
            <Input id="amb-reward" name="reward" maxLength={200} />
          </Field>
        </div>
        {state?.ok ? (
          <p role="status" className="text-sm text-ink-muted">
            {t("saved")}
          </p>
        ) : null}
        <div>
          <SubmitButton pending={pending} className="w-full sm:w-auto">
            {t("add")}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

/** Réduction associée au code d'un ambassadeur (RG-AMB-01) : son code devient aussi un code promo. */
export function AmbassadorPromoForm({ orgSlug, eventId, id, code }: { orgSlug: string; eventId: string; id: string; code: string }) {
  const t = useTranslations("ambassadors");
  const { state, pending, formProps } = useActionForm(ambassadorPromoAction.bind(null, orgSlug, eventId, id), null);
  const error = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-2" noValidate>
      <FormError state={state} />
      <p className="text-ink-muted">{t("promoHint", { code })}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("promoType")} htmlFor={`promo-type-${id}`}>
          <select id={`promo-type-${id}`} name="discountType" defaultValue="PERCENT" className="h-11 rounded-xl bg-surface-sunken px-3">
            <option value="PERCENT">{t("promoPercent")}</option>
            <option value="AMOUNT">{t("promoAmount")}</option>
          </select>
        </Field>
        <Field label={t("promoValue")} htmlFor={`promo-value-${id}`} error={error("value")}>
          <Input id={`promo-value-${id}`} name="value" inputMode="decimal" maxLength={12} required className="w-28" />
        </Field>
        <SubmitButton pending={pending}>{t("promoAdd")}</SubmitButton>
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
  const [, action, pending] = useActionState(ambassadorCommandAction.bind(null, orgSlug, eventId, id, command), null);
  return (
    <form action={action} className="contents">
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
