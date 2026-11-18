"use client";

import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { cn } from "@/components/ui/cn";
import { checkoutAction, portalAction } from "./actions";

/**
 * Passer en Pro : choix mensuel ou annuel. Avec Mollie (docs/MOLLIE.md, lot 6) : essai de 14 jours sans carte, ou
 * abonnement payé sur la page de Mollie, dont la première période commence à la fin de ce qui court encore (startsOn).
 * Avant Mollie : Stripe Checkout, essai compris (RG-SUB-02).
 */
export function PlanPicker({
  orgSlug,
  prices,
  currency,
  trial,
  provider,
  startsOn,
  cta,
}: {
  orgSlug: string;
  prices: { MONTH: number; YEAR: number };
  currency: string;
  trial: boolean;
  /** prestataire de l'offre Pro ; sans lui, le parcours d'avant Mollie (Stripe Checkout) */
  provider?: "MOLLIE" | "STRIPE" | null;
  /** date (mise en forme) du début de la première période payée, si elle ne commence pas tout de suite */
  startsOn?: string | null;
  /** libellé du bouton d'abonnement (« Passer en Pro », « S'abonner ») */
  cta?: string;
}) {
  const t = useTranslations("billing");
  const locale = useLocale() as Locale;
  const [interval, setInterval] = useState<"MONTH" | "YEAR">("YEAR");
  const { state, pending, formProps } = useActionForm(
    checkoutAction.bind(null, orgSlug),
    null,
  );
  const money = (v: number) =>
    formatMoney(v, currency, locale, { trimZeroCents: true });
  const perMonth = Math.round(prices.YEAR / 12);
  const saving = Math.round(
    ((prices.MONTH * 12 - prices.YEAR) * 100) / (prices.MONTH * 12),
  );
  const mollie = provider === "MOLLIE";
  return (
    <form {...formProps} className="grid gap-4">
      <div
        className="grid gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label={t("interval")}
      >
        {(["MONTH", "YEAR"] as const).map((i) => (
          <label
            key={i}
            className={cn(
              // refonte A3 : un choix en carte (arrondi 10 px, filet de 1 px) ; choisi, charbon comme la puce du prochain
              // événement (« .chip.next »)
              "grid cursor-pointer gap-1 rounded-[10px] border border-line-strong px-4 py-3.5",
              "has-[:checked]:border-surface-inverse has-[:checked]:bg-surface-inverse has-[:checked]:text-ink-inverse",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
            )}
          >
            <input
              type="radio"
              name="interval"
              value={i}
              checked={interval === i}
              onChange={() => setInterval(i)}
              className="sr-only"
            />
            <span className="flex items-center justify-between gap-2 font-semibold">
              {t(`interval_${i}`)}
              {i === "YEAR" ? (
                <span className="rounded-[6px] bg-[var(--evoly-rose)] px-2 py-0.5 text-[12px] font-semibold text-[var(--evoly-charbon)]">
                  −{saving} %
                </span>
              ) : null}
            </span>
            <span className="font-figures text-[1.6875rem] tracking-[var(--tracking-figures)] tabular-nums">
              {money(prices[i])}
            </span>
            <span className="text-[13px] opacity-80">
              {i === "MONTH"
                ? t("perMonth")
                : t("perYear", { perMonth: money(perMonth) })}
            </span>
          </label>
        ))}
      </div>
      <FormError state={state} />
      {mollie && trial ? (
        <>
          <SubmitButton
            variant="primary"
            name="mode"
            value="trial"
            pending={pending}
            className="w-full sm:w-auto sm:justify-self-start"
          >
            {t("startTrial")}
          </SubmitButton>
          <p className="text-xs text-ink-muted">{t("trialTermsNoCard")}</p>
          <div className="grid gap-2 border-t border-line pt-4">
            <SubmitButton
              variant="secondary"
              name="mode"
              value="pay"
              pending={pending}
              className="w-full sm:w-auto sm:justify-self-start"
            >
              {t("subscribeNow")}
            </SubmitButton>
            <p className="text-xs text-ink-muted">{t("subscribeTerms")}</p>
          </div>
        </>
      ) : mollie ? (
        <>
          <SubmitButton
            variant="primary"
            name="mode"
            value="pay"
            pending={pending}
            className="w-full sm:w-auto sm:justify-self-start"
          >
            {cta ?? t("upgrade")}
          </SubmitButton>
          <p className="text-xs text-ink-muted">
            {startsOn ? `${t("subscribeFrom", { date: startsOn })} ` : ""}
            {t("subscribeTerms")}
          </p>
        </>
      ) : (
        <>
          <SubmitButton
            variant="primary"
            pending={pending}
            className="w-full sm:w-auto sm:justify-self-start"
          >
            {trial ? t("startTrial") : t("upgrade")}
          </SubmitButton>
          <p className="text-xs text-ink-muted">
            {trial ? t("trialTerms") : t("upgradeTerms")}
          </p>
        </>
      )}
    </form>
  );
}

/** Ancien abonnement Stripe : portail client Stripe. */
export function ManageSubscription({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("billing");
  const [state, action] = useActionState(
    portalAction.bind(null, orgSlug),
    null,
  );
  return (
    <form action={action} className="grid gap-2">
      <SubmitButton
        variant="dark"
        className="w-full sm:w-auto sm:justify-self-start"
      >
        {t("manage")}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
