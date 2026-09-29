"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui/Field";
import { registerAction } from "../actions";

export function RegisterForm({ email }: { email?: string }) {
  const t = useTranslations("auth");
  const { state, pending, formProps } = useActionForm(registerAction, null);
  const fieldError = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-5" noValidate>
      <FormError state={state} />
      <Field label={t("name")} htmlFor="name" error={fieldError("name")}>
        <Input id="name" name="name" autoComplete="name" required invalid={!!fieldError("name")} />
      </Field>
      <Field label={t("email")} htmlFor="email" error={fieldError("email")}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={email} invalid={!!fieldError("email")} />
      </Field>
      <Field label={t("password")} htmlFor="password" hint={t("passwordHint")} error={fieldError("password")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required invalid={!!fieldError("password")} />
      </Field>
      <SubmitButton pending={pending}>{t("register")}</SubmitButton>
      <p className="text-center text-sm text-ink-muted">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          {t("login")}
        </Link>
      </p>
    </form>
  );
}
