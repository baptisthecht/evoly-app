"use client";

import { useTranslations } from "next-intl";
import { FormError, useActionForm } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { DialogFooter } from "@/components/ui/Dialog";
import { Field, Input, Select, TEXTAREA_CLASS } from "@/components/ui/Field";
import { complimentaryAction } from "@/app/o/[orgSlug]/events/actions";

/** US-ORD-03 : billets offerts (commande sans paiement ni commission, décomptée de la jauge), dans une fenêtre. */
export function ComplimentaryForm({
  orgSlug,
  eventId,
  ticketTypes,
  onDone,
}: {
  orgSlug: string;
  eventId: string;
  ticketTypes: Array<{ id: string; name: string }>;
  /** Fermer la fenêtre (« Annuler »). */
  onDone?: () => void;
}) {
  const t = useTranslations("complimentary");
  const tf = useTranslations("formErrors");
  const { state, pending, formProps } = useActionForm(
    complimentaryAction.bind(null, orgSlug, eventId),
    null,
  );
  const data = state?.ok ? state.data : null;
  const sent = data?.results.filter((r) => r.ok).length ?? 0;
  const tc = useTranslations("common");
  const formId = "complimentary-form";
  // refonte A3 (maquette « Nouveau tarif ») : dans la fenêtre, les boutons dans son pied (DialogFooter)
  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-ink-muted">{t("intro")}</p>
      <form id={formId} {...formProps} className="grid gap-4" noValidate>
        <FormError state={state} />
        <Field
          label={t("recipients")}
          htmlFor="comp-recipients"
          hint={t("recipientsHint")}
        >
          <textarea
            id="comp-recipients"
            name="recipients"
            rows={5}
            className={TEXTAREA_CLASS}
            placeholder={
              "lea@exemple.be\nTom Dubois <tom@exemple.be>\nines@exemple.be;Inès;Benali"
            }
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label={t("ticketType")} htmlFor="comp-type">
            <Select
              id="comp-type"
              name="ticketTypeId"
              defaultValue={ticketTypes[0]?.id}
            >
              {ticketTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("quantityEach")} htmlFor="comp-qty">
            <Input
              id="comp-qty"
              name="quantityEach"
              type="number"
              min={1}
              max={10}
              defaultValue={1}
            />
          </Field>
        </div>
        <DialogFooter>
          {onDone ? (
            <Button type="button" variant="secondary" onClick={onDone}>
              {tc("cancel")}
            </Button>
          ) : null}
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={pending}
            aria-busy={pending}
          >
            {t("send")}
          </Button>
        </DialogFooter>
      </form>
      {data ? (
        <div
          className="grid gap-1.5 rounded-[8px] bg-surface-soft px-3 py-2.5 text-[13px]"
          role="status"
        >
          <p className="font-medium">{t("sent", { count: sent })}</p>
          {data.results
            .filter((r) => !r.ok)
            .map((r) => (
              <p key={r.email} className="text-danger">
                {r.email} :{" "}
                {!r.ok && tf.has(r.error) ? tf(r.error) : t("failed")}
              </p>
            ))}
          {data.invalid.map((l) => (
            <p key={l.line} className="text-danger">
              {t("invalidLine", { line: l.line, value: l.value })}
            </p>
          ))}
          {data.tooMany ? <p className="text-warning">{t("tooMany")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
