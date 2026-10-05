"use client";

import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/forms";
import { cn } from "@/components/ui/cn";
import { checkoutAction, portalAction } from "./actions";

/** Free : choix mensuel ou annuel, puis Stripe Checkout (RG-SUB-02). */
export function PlanPicker({
  orgSlug,
  prices,
  currency,
  trial,
}: {
  orgSlug: string;
  prices: { MONTH: number; YEAR: number };
  currency: string;
  trial: boolean;
}) {
  const t = useTranslations("billing");
  const locale = useLocale() as Locale;
  const [interval, setInterval] = useState<"MONTH" | "YEAR">("YEAR");
  const [state, action] = useActionState(checkoutAction.bind(null, orgSlug), null);
  const money = (v: number) => formatMoney(v, currency, locale, { trimZeroCents: true });
  const perMonth = Math.round(prices.YEAR / 12);
  const saving = Math.round(((prices.MONTH * 12 - prices.YEAR) * 100) / (prices.MONTH * 12));
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("interval")}>
        {(["MONTH", "YEAR"] as const).map((i) => (
          <label
            key={i}
            className={cn(
              "grid cursor-pointer gap-1 rounded-lg p-4 ring-1 ring-line-strong",
              "has-[:checked]:bg-surface-inverse has-[:checked]:text-ink-inverse has-[:checked]:ring-0",
            )}
          >
            <input type="radio" name="interval" value={i} checked={interval === i} onChange={() => setInterval(i)} className="sr-only" />
            <span className="flex items-center justify-between gap-2 font-semibold">
              {t(`interval_${i}`)}
              {i === "YEAR" ? (
                <span className="rounded-full bg-[var(--evoly-rose)] px-2 py-0.5 text-xs font-bold text-[var(--evoly-charbon)]">−{saving} %</span>
              ) : null}
            </span>
            <span className="font-display text-2xl tabular-nums">{money(prices[i])}</span>
            <span className="text-sm opacity-80">{i === "MONTH" ? t("perMonth") : t("perYear", { perMonth: money(perMonth) })}</span>
          </label>
        ))}
      </div>
      <FormError state={state} />
      <SubmitButton variant="primary" className="w-full sm:w-auto sm:justify-self-start">
        {trial ? t("startTrial") : t("upgrade")}
      </SubmitButton>
      <p className="text-xs text-ink-muted">{trial ? t("trialTerms") : t("upgradeTerms")}</p>
    </form>
  );
}

export function ManageSubscription({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("billing");
  const [state, action] = useActionState(portalAction.bind(null, orgSlug), null);
  return (
    <form action={action} className="grid gap-2">
      <SubmitButton variant="dark" className="w-full sm:w-auto sm:justify-self-start">
        {t("manage")}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
