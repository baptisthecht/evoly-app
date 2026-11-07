"use client";

import { useTranslations } from "next-intl";
import { FormError, useActionForm } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { SavedNote, SwitchRow } from "@/components/ui/Controls";
import { DialogFooter } from "@/components/ui/Dialog";
import { optionsRefundPolicyAction } from "../../actions";

/** RG-OPT-07 : options non retirées remboursables après le début de l'événement (désactivé par défaut). */
export function OptionsRefundPolicy({
  orgSlug,
  eventId,
  allowed,
}: {
  orgSlug: string;
  eventId: string;
  allowed: boolean;
}) {
  const t = useTranslations("options");
  const { state, pending, formProps } = useActionForm(
    optionsRefundPolicyAction.bind(null, orgSlug, eventId),
    null,
  );
  // dans une fenêtre (refonte A3) : l'interrupteur et son explication, le bouton dans le pied
  return (
    <form
      id="options-refund-form"
      {...formProps}
      className="grid gap-4"
      noValidate
    >
      <FormError state={state} />
      <SwitchRow
        name="allowed"
        defaultChecked={allowed}
        label={t("refundAfterStart")}
        hint={t("refundAfterStartHint")}
      />
      <DialogFooter>
        {state?.ok ? (
          <span className="mr-auto">
            <SavedNote id="options-refund-saved">
              {t("refundPolicySaved")}
            </SavedNote>
          </span>
        ) : null}
        <Button
          type="submit"
          form="options-refund-form"
          variant="primary"
          disabled={pending}
          aria-busy={pending}
        >
          {t("refundPolicySave")}
        </Button>
      </DialogFooter>
    </form>
  );
}
