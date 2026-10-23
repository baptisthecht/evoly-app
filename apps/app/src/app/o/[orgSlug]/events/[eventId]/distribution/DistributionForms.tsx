"use client";
import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import {
  FormError,
  SubmitButton,
  useActionForm,
  useFieldError,
} from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  createDistributorAction,
  createPrecreatedCodesAction,
  releaseUnsoldAction,
  setAllocationAction,
} from "../../actions";

/** Ajout d'un réseau de l'organisation : le nom habituel du réseau est proposé, modifiable. */
export function AddDistributorForm({
  orgSlug,
  eventId,
  kinds,
}: {
  orgSlug: string;
  eventId: string;
  kinds: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations("distribution");
  const { state, pending, formProps } = useActionForm(
    createDistributorAction.bind(null, orgSlug, eventId),
    null,
  );
  const error = useFieldError(state);
  return (
    <form
      {...formProps}
      className="grid gap-4 border-t border-line pt-4"
      noValidate
    >
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
        <Field
          label={t("name")}
          htmlFor="dist-name"
          hint={t("nameHint")}
          error={error("name")}
        >
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
  const { state, pending, formProps } = useActionForm(
    setAllocationAction.bind(null, props.orgSlug, props.eventId),
    null,
  );
  return (
    <form
      {...formProps}
      className="grid gap-2 rounded-md bg-surface-sunken p-3"
      noValidate
    >
      <input type="hidden" name="distributorId" value={props.distributorId} />
      <input type="hidden" name="ticketTypeId" value={props.ticketTypeId} />
      <Field
        label={props.distributorName}
        htmlFor={id}
        hint={
          props.imported > 0
            ? t("importedHint", { count: props.imported })
            : undefined
        }
      >
        <div className="flex gap-2">
          <Input
            id={id}
            name="quantity"
            inputMode="numeric"
            defaultValue={String(props.quantity)}
            disabled={props.disabled}
            className="max-w-32"
          />
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
export function ReleaseUnsoldButton({
  orgSlug,
  eventId,
  distributorId,
  count,
}: {
  orgSlug: string;
  eventId: string;
  distributorId: string;
  count: number;
}) {
  const t = useTranslations("distribution");
  const [state, action, pending] = useActionState(
    releaseUnsoldAction.bind(null, orgSlug, eventId, distributorId),
    null,
  );
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

/** Codes créés à l'avance pour un réseau (BilletReduc…) : pris sur son contingent, téléchargés en CSV pour impression. */
export function PrecreatedCodesForm(props: {
  orgSlug: string;
  eventId: string;
  distributorId: string;
  ticketTypes: Array<{ id: string; name: string; free: number }>;
  existing: number;
}) {
  const t = useTranslations("distribution");
  const id = useId();
  const { state, pending, formProps } = useActionForm(
    createPrecreatedCodesAction.bind(null, props.orgSlug, props.eventId),
    null,
  );
  const download = `/o/${props.orgSlug}/events/${props.eventId}/distribution/codes?distributor=${encodeURIComponent(props.distributorId)}`;
  return (
    <form
      {...formProps}
      className="grid w-full gap-3 rounded-md bg-surface p-4"
      noValidate
    >
      <div className="grid gap-1">
        <p className="font-semibold">{t("codesTitle")}</p>
        <p className="text-sm text-ink-muted">{t("codesHint")}</p>
      </div>
      <input type="hidden" name="distributorId" value={props.distributorId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("codesTarif")} htmlFor={`${id}-tt`}>
          <Select
            id={`${id}-tt`}
            name="ticketTypeId"
            defaultValue={props.ticketTypes[0]?.id}
          >
            {props.ticketTypes.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {t("codesTarifOption", { name: tt.name, free: tt.free })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("codesCount")} htmlFor={`${id}-n`}>
          <Input
            id={`${id}-n`}
            name="count"
            inputMode="numeric"
            defaultValue="1"
            className="max-w-32"
          />
        </Field>
      </div>
      <FormError state={state} />
      {state?.ok ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("codesCreated", { count: state.data.created })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="secondary">
          {t("codesCreate")}
        </SubmitButton>
        {props.existing > 0 || state?.ok ? (
          <a
            href={download}
            className="text-sm font-semibold underline underline-offset-4"
          >
            {t("codesDownload", {
              count: props.existing + (state?.ok ? state.data.created : 0),
            })}
          </a>
        ) : null}
      </div>
    </form>
  );
}
