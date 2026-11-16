"use client";

import type { RefundRule } from "@evoly/core";
import { formatDate, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";

/**
 * Règle de remboursement affichée avant l'achat (lot « remboursement à coût neutre ») : la politique de l'événement,
 * puis, si les billets sont remboursables, ce qui est rendu (prix payé en entier, ou moins les frais de paiement et de
 * service). Page de l'événement et tunnel d'achat ; la même phrase est rappelée dans l'e-mail de confirmation.
 */
export function RefundRuleText({
  rule,
  className,
}: {
  rule: RefundRule;
  className?: string;
}) {
  const t = useTranslations("public");
  const locale = useLocale() as Locale;
  const policy =
    rule.policy === "UNTIL_DEADLINE" && rule.deadlineAt
      ? t("refundRule_UNTIL_DEADLINE", {
          date: formatDate(new Date(rule.deadlineAt), rule.timezone, locale),
        })
      : rule.policy === "UNTIL_DEADLINE"
        ? t("refundRule_ALWAYS")
        : t(`refundRule_${rule.policy}`);
  return (
    <p className={className}>
      <span className="font-semibold">{t("refundLabel")}</span> {policy}
      {rule.policy !== "NON_REFUNDABLE"
        ? ` ${t(`refundFee_${rule.feeMode}`)}`
        : ""}
    </p>
  );
}
