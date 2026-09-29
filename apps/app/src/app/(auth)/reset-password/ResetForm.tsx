"use client";

import { useTranslations } from "next-intl";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui/Field";
import { resetPasswordAction } from "../actions";

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const { state, pending, formProps } = useActionForm(resetPasswordAction, null);
  const fieldError = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-5" noValidate>
      <FormError state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label={t("newPassword")} htmlFor="password" hint={t("passwordHint")} error={fieldError("password")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required invalid={!!fieldError("password")} />
      </Field>
      <SubmitButton pending={pending}>{t("saveNewPassword")}</SubmitButton>
    </form>
  );
}
