"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/forms";
import { resendVerificationAction } from "../actions";

export function ResendForm({ email }: { email: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(resendVerificationAction, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="email" value={email} />
      {state?.ok ? (
        <p role="status" className="rounded-md bg-success-soft px-4 py-3 text-sm text-success">
          {t("verifyResent")}
        </p>
      ) : null}
      <SubmitButton variant="primary">{t("verifyResend")}</SubmitButton>
    </form>
  );
}
