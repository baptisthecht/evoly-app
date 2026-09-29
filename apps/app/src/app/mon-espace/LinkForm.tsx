"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { requestLinkAction } from "./actions";

export function LinkForm() {
  const t = useTranslations("participant");
  const [sent, action, pending] = useActionState(requestLinkAction, false);
  if (sent) return <p className="rounded-md bg-success-soft px-4 py-3 text-sm font-semibold text-success" role="status">{t("sent")}</p>;
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-semibold">
        {t("email")}
        <input name="email" type="email" inputMode="email" autoComplete="email" required className="h-12 rounded-xl bg-surface px-4 shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]" />
      </label>
      <button type="submit" disabled={pending} className="h-12 rounded-full bg-surface-inverse font-semibold text-ink-inverse">
        {t("send")}
      </button>
    </form>
  );
}
