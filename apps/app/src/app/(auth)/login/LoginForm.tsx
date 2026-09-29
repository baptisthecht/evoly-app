"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui/Field";
import { loginAction } from "../actions";

export function LoginForm() {
  const t = useTranslations("auth");
  const { state, pending, formProps } = useActionForm(loginAction, null);
  const next = useSearchParams().get("next") ?? "";
  const fieldError = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />
      <Field label={t("email")} htmlFor="email" error={fieldError("email")}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required invalid={!!fieldError("email")} />
      </Field>
      <Field label={t("password")} htmlFor="password" error={fieldError("password")}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required invalid={!!fieldError("password")} />
      </Field>
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-sm font-medium text-ink underline underline-offset-4">
          {t("forgotPassword")}
        </Link>
      </div>
      <SubmitButton pending={pending}>{t("login")}</SubmitButton>
      <p className="text-center text-sm text-ink-muted">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-semibold text-ink underline underline-offset-4">
          {t("register")}
        </Link>
      </p>
    </form>
  );
}
