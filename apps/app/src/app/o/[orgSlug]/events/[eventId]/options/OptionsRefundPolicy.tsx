"use client";

import { useTranslations } from "next-intl";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { Card } from "@/components/ui/Card";
import { optionsRefundPolicyAction } from "../../actions";

/** RG-OPT-07 : options non retirées remboursables après le début de l'événement (désactivé par défaut). */
export function OptionsRefundPolicy({ orgSlug, eventId, allowed }: { orgSlug: string; eventId: string; allowed: boolean }) {
  const t = useTranslations("options");
  const { state, pending, formProps } = useActionForm(optionsRefundPolicyAction.bind(null, orgSlug, eventId), null);
  return (
    <Card className="grid gap-3">
      <form {...formProps} className="grid gap-3">
        <FormError state={state} />
        <label className="flex items-center gap-3">
          <input type="checkbox" name="allowed" defaultChecked={allowed} className="size-5 accent-[var(--ink)]" />
          <span className="font-semibold">{t("refundAfterStart")}</span>
        </label>
        <p className="text-sm text-ink-muted">{t("refundAfterStartHint")}</p>
        <div>
          <SubmitButton pending={pending}>{t("refundPolicySave")}</SubmitButton>
        </div>
        {state?.ok ? (
          <p role="status" className="text-sm text-ink-muted">
            {t("refundPolicySaved")}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
