"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { ambassadorCommandAction, createAmbassadorAction } from "../../actions";

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

/** Désactiver ou réactiver un ambassadeur. */
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
  command: "activate" | "deactivate";
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
