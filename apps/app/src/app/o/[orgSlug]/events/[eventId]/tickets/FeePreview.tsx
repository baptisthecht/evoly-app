"use client";

import { estimateBankFee, organizerNet, parseMajorToMinor, ticketCommission, type FeeTerms } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";

/** RG-TKT-02 : commission, frais bancaires estimés et montant touché, en direct. */
export function FeePreview({ price, terms }: { price: string; terms: FeeTerms }) {
  const t = useTranslations("tickets");
  const locale = useLocale() as Locale;
  const minor = parseMajorToMinor(price);
  if (minor == null || minor === 0) return <p className="text-sm text-ink-muted">{minor === 0 ? t("freeNoFees") : "\u00a0"}</p>;
  const commission = ticketCommission(minor, terms);
  const bank = estimateBankFee(minor);
  const f = (v: number) => formatMoney(v, terms.currency, locale);
  return (
    <div className="rounded-md bg-surface-accent-2 px-4 py-3 text-sm" aria-live="polite">
      <p className="font-semibold">{t("youReceive", { amount: f(organizerNet(minor, commission, bank)) })}</p>
      <p className="text-ink-muted">{t("feesDetail", { commission: f(commission), bankFee: f(bank) })}</p>
    </div>
  );
}
