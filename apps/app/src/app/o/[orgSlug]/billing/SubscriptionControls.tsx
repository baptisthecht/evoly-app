"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import type { ActionState } from "@/server/guard";
import {
  cancelAction,
  checkoutAction,
  paymentMethodAction,
  resumeAction,
} from "./actions";

/** Abonnement payé par Mollie : changer de moyen de paiement (carte enregistrée sur la page de Mollie, sans paiement). */
export function ChangePaymentMethod({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("billing");
  const { state, pending, formProps } = useActionForm(
    (prev: ActionState) => paymentMethodAction(orgSlug, prev),
    null,
  );
  return (
    <form {...formProps} className="grid gap-1.5">
      <FormError state={state} />
      <SubmitButton
        variant="secondary"
        pending={pending}
        className="w-full sm:w-auto sm:justify-self-start"
      >
        {t("changePaymentMethod")}
      </SubmitButton>
      <p className="text-xs text-ink-muted">{t("changePaymentMethodHelp")}</p>
    </form>
  );
}

/** Période impayée : la régler sur la page de Mollie, avec un moyen qui servira aussi aux renouvellements. */
export function SettleNow({
  orgSlug,
  interval,
  label,
}: {
  orgSlug: string;
  interval: "MONTH" | "YEAR";
  label: string;
}) {
  const t = useTranslations("billing");
  const { state, pending, formProps } = useActionForm(
    checkoutAction.bind(null, orgSlug),
    null,
  );
  return (
    <form {...formProps} className="grid gap-1.5">
      <input type="hidden" name="interval" value={interval} />
      <FormError state={state} />
      <SubmitButton
        variant="primary"
        name="mode"
        value="pay"
        pending={pending}
        className="w-full sm:w-auto sm:justify-self-start"
      >
        {label}
      </SubmitButton>
      <p className="text-xs text-ink-muted">{t("settleHelp")}</p>
    </form>
  );
}

/** Reprendre un abonnement résilié avant la fin de sa période, sans payer. */
export function ResumeSubscription({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("billing");
  const { state, pending, formProps } = useActionForm(
    (prev: ActionState) => resumeAction(orgSlug, prev),
    null,
  );
  return (
    <form {...formProps} className="grid gap-1.5">
      <FormError state={state} />
      <SubmitButton
        variant="dark"
        pending={pending}
        className="w-full sm:w-auto sm:justify-self-start"
      >
        {t("resume")}
      </SubmitButton>
    </form>
  );
}

/** Résilier, après confirmation : plus de prélèvement, Pro jusqu'à la fin de la période payée. */
export function CancelSubscription({
  orgSlug,
  until,
}: {
  orgSlug: string;
  until: string;
}) {
  const t = useTranslations("billing");
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(
    async (prev: ActionState) => {
      const r = await cancelAction(orgSlug, prev);
      if (r?.ok) setOpen(false);
      return r;
    },
    null,
  );
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="sm:justify-self-start"
        onClick={() => setOpen(true)}
      >
        {t("cancel")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cancelTitle")}
      >
        <form id="pro-cancel" {...formProps} className="grid gap-3">
          <FormError state={state} />
          <p className="text-ink-body">{t("cancelBody", { date: until })}</p>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {t("cancelKeep")}
            </Button>
            <Button
              type="submit"
              form="pro-cancel"
              variant="danger"
              disabled={pending}
            >
              {t("cancelConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
