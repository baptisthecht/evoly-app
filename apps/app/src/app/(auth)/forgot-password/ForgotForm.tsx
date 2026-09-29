"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui/Field";
import { forgotPasswordAction } from "../actions";

export function ForgotForm() {
  const t = useTranslations("auth");
  const { state, pending, formProps } = useActionForm(forgotPasswordAction, null);
  const fieldError = useFieldError(state);
  if (state?.ok)
    return (
      <div className="grid gap-5">
        <p role="status" className="rounded-md bg-success-soft px-4 py-3 text-sm text-success">
          {t("resetSent")}
        </p>
        <Link href="/login" className="text-center text-sm font-semibold underline underline-offset-4">
          {t("backToLogin")}
        </Link>
      </div>
    );
  return (
    <form {...formProps} className="grid gap-5" noValidate>
      <FormError state={state} />
      <Field label={t("email")} htmlFor="email" error={fieldError("email")}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required invalid={!!fieldError("email")} />
      </Field>
      <SubmitButton pending={pending}>{t("sendResetLink")}</SubmitButton>
      <Link href="/login" className="text-center text-sm font-semibold underline underline-offset-4">
        {t("backToLogin")}
      </Link>
    </form>
  );
}
