"use client";

import type { RefundFeeMode } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError, useActionForm } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { refundDefaultAction } from "../actions";

/**
 * Paramètres, Paiements : remboursement par défaut des nouveaux événements, quand l'acheteur le demande (intégral, ou
 * moins les frais). Chaque événement garde ensuite son propre réglage.
 */
export function RefundDefault({
  orgSlug,
  value,
  readOnly,
}: {
  orgSlug: string;
  value: RefundFeeMode;
  readOnly: boolean;
}) {
  const t = useTranslations("eventSettings");
  const ts = useTranslations("settings");
  const [mode, setMode] = useState<RefundFeeMode>(value);
  const { state, pending, formProps } = useActionForm(
    refundDefaultAction.bind(null, orgSlug),
    null,
  );
  return (
    <form {...formProps} className="grid gap-2">
      <FormError state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          id="refundFeeModeDefault"
          name="refundFeeMode"
          aria-label={ts("refundDefaultTitle")}
          value={mode}
          disabled={readOnly}
          onChange={(e) => setMode(e.target.value as RefundFeeMode)}
          className="max-w-[320px]"
        >
          {(["FULL", "MINUS_FEES"] as const).map((m) => (
            <option key={m} value={m}>
              {t(`refundFees_${m}`)}
            </option>
          ))}
        </Select>
        {readOnly ? null : (
          <Button type="submit" variant="secondary" disabled={pending}>
            {ts("refundDefaultSave")}
          </Button>
        )}
      </div>
      <p className="text-[13px] text-ink-muted">
        {t(`refundFeesHint_${mode}`)}
      </p>
      {state?.ok ? (
        <p role="status" className="text-[13px] text-success">
          {ts("refundDefaultSaved")}
        </p>
      ) : null}
    </form>
  );
}
