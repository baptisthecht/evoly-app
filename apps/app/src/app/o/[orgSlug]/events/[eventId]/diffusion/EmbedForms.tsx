"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import {
  FormError,
  SubmitButton,
  useActionForm,
  useFieldError,
} from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { addEmbedOriginAction, removeEmbedOriginAction } from "../../actions";

/** Ajout d'un site autorisé (section 9.26). */
export function AddOriginForm({
  orgSlug,
  eventId,
}: {
  orgSlug: string;
  eventId: string;
}) {
  const t = useTranslations("embed");
  const { state, pending, formProps } = useActionForm(
    addEmbedOriginAction.bind(null, orgSlug, eventId),
    null,
  );
  const error = useFieldError(state);
  return (
    // refonte A3 : le champ et son bouton sur une ligne, l'aide ou l'erreur dessous
    <form {...formProps} className="grid gap-1.5" noValidate>
      <FormError state={state} />
      <label
        htmlFor="embed-origin"
        className="text-[length:var(--label-size)] [font-weight:var(--label-weight)]"
      >
        {t("siteAdd")}
      </label>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <Input
            id="embed-origin"
            name="origin"
            placeholder="monclub.be"
            maxLength={200}
            required
            invalid={!!error("origin")}
            aria-describedby={error("origin") ? "embed-origin-help" : undefined}
          />
        </span>
        <SubmitButton
          pending={pending}
          variant="secondary"
          className="shrink-0"
        >
          {t("add")}
        </SubmitButton>
      </div>
      {/* l'explication est à gauche, dans la rangée : ici, l'erreur seule */}
      {error("origin") ? (
        <p
          id="embed-origin-help"
          role="alert"
          className="-mt-px text-[length:var(--hint-size)] text-danger"
        >
          {error("origin")}
        </p>
      ) : null}
    </form>
  );
}

export function RemoveOrigin({
  orgSlug,
  eventId,
  origin,
  label,
}: {
  orgSlug: string;
  eventId: string;
  origin: string;
  label: string;
}) {
  const [, action, pending] = useActionState(
    removeEmbedOriginAction.bind(null, orgSlug, eventId, origin),
    null,
  );
  return (
    <form action={action} className="contents">
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
