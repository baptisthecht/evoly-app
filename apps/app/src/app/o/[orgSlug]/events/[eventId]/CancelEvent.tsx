"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  FormError,
  SubmitButton,
  useActionForm,
  useFieldError,
} from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field, Input, TEXTAREA_CLASS } from "@/components/ui/Field";
import { cancelEventAction } from "../actions";

/** RG-REF-07 : double confirmation (motif, puis saisie du titre de l'événement). */
export function CancelEvent({
  orgSlug,
  eventId,
  title,
  paidOrders,
}: {
  orgSlug: string;
  eventId: string;
  title: string;
  paidOrders: number;
}) {
  const t = useTranslations("events");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const { state, pending, formProps } = useActionForm(
    cancelEventAction.bind(null, orgSlug, eventId),
    null,
  );
  const error = useFieldError(state);
  if (!open)
    return (
      <Button
        type="button"
        variant="secondary"
        className="justify-self-start text-danger!"
        onClick={() => setOpen(true)}
      >
        {t("cancelEvent")}
      </Button>
    );
  return (
    <form
      {...formProps}
      className="grid gap-3.5 rounded-[10px] bg-danger-soft p-4"
      noValidate
    >
      <p className="font-medium text-danger">
        {t("cancelWarning", { count: paidOrders })}
      </p>
      <FormError state={state} />
      <Field
        label={t("cancelReason")}
        htmlFor="cancel-reason"
        hint={t("cancelReasonHint")}
        error={error("reason")}
      >
        <textarea
          id="cancel-reason"
          name="reason"
          rows={3}
          maxLength={500}
          required
          className={TEXTAREA_CLASS}
        />
      </Field>
      <Field
        label={t("cancelConfirmLabel", { title })}
        htmlFor="cancel-confirm"
        error={error("confirmation")}
      >
        <Input
          id="cancel-confirm"
          name="confirmation"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} variant="danger">
          {t("cancelSubmit")}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancelAbort")}
        </Button>
      </div>
      {typed && typed.trim() !== title.trim() ? (
        <p className="text-[13px] text-danger">{t("cancelTitleMismatch")}</p>
      ) : null}
    </form>
  );
}
