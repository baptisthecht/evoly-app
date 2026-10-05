"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { verifyAction } from "./actions";

export function VerifyForm({ next }: { next: string }) {
  const t = useTranslations("twoFactor");
  const [error, action, pending] = useActionState(verifyAction.bind(null, next), null);
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-semibold">
        {t("code")}
        <input
          name="code"
          autoComplete="one-time-code"
          maxLength={12}
          className="h-12 rounded-xl bg-surface px-4 text-center font-mono text-xl tracking-[0.25em] shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]"
        />
      </label>
      <p className="text-xs text-ink-muted">{t("recoveryHint")}</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {t(error)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="h-12 rounded-full bg-surface-inverse font-semibold text-ink-inverse">
        {t("verify")}
      </button>
    </form>
  );
}
