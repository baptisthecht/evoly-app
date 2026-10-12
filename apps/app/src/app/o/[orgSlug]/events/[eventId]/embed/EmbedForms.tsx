"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { addEmbedOriginAction, removeEmbedOriginAction } from "../../actions";

/** Ajout d'un site autorisé (section 9.26). */
export function AddOriginForm({ orgSlug, eventId }: { orgSlug: string; eventId: string }) {
  const t = useTranslations("embed");
  const { state, pending, formProps } = useActionForm(addEmbedOriginAction.bind(null, orgSlug, eventId), null);
  const error = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-3 sm:flex sm:items-end" noValidate>
      <FormError state={state} />
      <Field label={t("siteAdd")} htmlFor="embed-origin" hint={t("sitesHint")} error={error("origin")}>
        <Input id="embed-origin" name="origin" placeholder="monclub.be" maxLength={200} required />
      </Field>
      <SubmitButton pending={pending}>{t("add")}</SubmitButton>
    </form>
  );
}

export function RemoveOrigin({ orgSlug, eventId, origin, label }: { orgSlug: string; eventId: string; origin: string; label: string }) {
  const [, action, pending] = useActionState(removeEmbedOriginAction.bind(null, orgSlug, eventId, origin), null);
  return (
    <form action={action} className="contents">
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
