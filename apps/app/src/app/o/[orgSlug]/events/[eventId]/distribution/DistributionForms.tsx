"use client";
import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/Field";
import { createDistributorAction, releaseUnsoldAction, setAllocationAction } from "../../actions";

/** Ajout d'un réseau de l'organisation : le nom habituel du réseau est proposé, modifiable. */
export function AddDistributorForm({ orgSlug, eventId, kinds }: { orgSlug: string; eventId: string; kinds: Array<{ value: string; label: string }> }) {
  const t = useTranslations("distribution");
  const { state, pending, formProps } = useActionForm(createDistributorAction.bind(null, orgSlug, eventId), null);
  const error = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-4 border-t border-line pt-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("kind")} htmlFor="dist-kind" error={error("kind")}>
          <Select id="dist-kind" name="kind" defaultValue={kinds[0]?.value}>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("name")} htmlFor="dist-name" hint={t("nameHint")} error={error("name")}>
          <Input id="dist-name" name="name" maxLength={60} />
        </Field>
      </div>
      {state?.ok ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("added")}
        </p>
      ) : null}
      <div>
        <SubmitButton pending={pending} className="w-full sm:w-auto">
          {t("add")}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Places d'un tarif confiées à un réseau : jamais au-delà des places en vente en ligne, jamais sous les billets importés. */
export function AllocationForm(props: {
  orgSlug: string;
  eventId: string;
  ticketTypeId: string;
  distributorId: string;
  distributorName: string;
  quantity: number;
  imported: number;
  disabled: boolean;
}) {
  const t = useTranslations("distribution");
  const id = useId();
  const { state, pending, formProps } = useActionForm(setAllocationAction.bind(null, props.orgSlug, props.eventId), null);
  return (
    <form {...formProps} className="grid gap-2 rounded-md bg-surface-sunken p-3" noValidate>
      <input type="hidden" name="distributorId" value={props.distributorId} />
      <input type="hidden" name="ticketTypeId" value={props.ticketTypeId} />
      <Field label={props.distributorName} htmlFor={id} hint={props.imported > 0 ? t("importedHint", { count: props.imported }) : undefined}>
        <div className="flex gap-2">
          <Input id={id} name="quantity" inputMode="numeric" defaultValue={String(props.quantity)} disabled={props.disabled} className="max-w-32" />
          {props.disabled ? null : (
            <SubmitButton pending={pending} variant="secondary">
              {t("save")}
            </SubmitButton>
          )}
        </div>
      </Field>
      <FormError state={state} />
      {state?.ok ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("saved")}
        </p>
      ) : null}
    </form>
  );
}

/** Rendre les invendus d'un réseau : après confirmation, les places reviennent à la vente en ligne. */
export function ReleaseUnsoldButton({ orgSlug, eventId, distributorId, count }: { orgSlug: string; eventId: string; distributorId: string; count: number }) {
  const t = useTranslations("distribution");
  const [state, action, pending] = useActionState(releaseUnsoldAction.bind(null, orgSlug, eventId, distributorId), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t("releaseConfirm", { count }))) e.preventDefault();
      }}
      className="grid justify-items-start gap-1"
    >
      <SubmitButton pending={pending} variant="secondary">
        {t("release", { count })}
      </SubmitButton>
      <FormError state={state} />
      {state?.ok ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("released", { count: state.data.released })}
        </p>
      ) : null}
    </form>
  );
}
