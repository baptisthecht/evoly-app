"use client";

import { useTranslations } from "next-intl";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { complimentaryAction } from "@/app/o/[orgSlug]/events/actions";

/** US-ORD-03 : billets offerts (commande sans paiement ni commission, décomptée de la jauge). */
export function ComplimentaryForm({ orgSlug, eventId, ticketTypes }: { orgSlug: string; eventId: string; ticketTypes: Array<{ id: string; name: string }> }) {
  const t = useTranslations("complimentary");
  const tf = useTranslations("formErrors");
  const { state, pending, formProps } = useActionForm(complimentaryAction.bind(null, orgSlug, eventId), null);
  const data = state?.ok ? state.data : null;
  const sent = data?.results.filter((r) => r.ok).length ?? 0;
  return (
    <Card className="mt-10 grid gap-3">
      <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("title")}</h2>
      <p className="-mt-1 text-sm text-ink-muted">{t("intro")}</p>
      <form {...formProps} className="grid gap-4" noValidate>
        <FormError state={state} />
        <Field label={t("recipients")} htmlFor="comp-recipients" hint={t("recipientsHint")}>
          <textarea id="comp-recipients" name="recipients" rows={5} className="block w-full rounded-md bg-surface-raised px-4 py-3 font-mono text-base shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]" placeholder={"lea@exemple.be\nTom Dubois <tom@exemple.be>\nines@exemple.be;Inès;Benali"} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label={t("ticketType")} htmlFor="comp-type">
            <Select id="comp-type" name="ticketTypeId" defaultValue={ticketTypes[0]?.id}>
              {ticketTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("quantityEach")} htmlFor="comp-qty">
            <Input id="comp-qty" name="quantityEach" type="number" min={1} max={10} defaultValue={1} />
          </Field>
        </div>
        <SubmitButton pending={pending} className="w-full sm:w-auto sm:justify-self-start">
          {t("send")}
        </SubmitButton>
      </form>
      {data ? (
        <div className="grid gap-2 rounded-md bg-surface-sunken p-4 text-sm" role="status">
          <p className="font-semibold">{t("sent", { count: sent })}</p>
          {data.results.filter((r) => !r.ok).map((r) => (
            <p key={r.email} className="text-danger">
              {r.email} : {!r.ok && tf.has(r.error) ? tf(r.error) : t("failed")}
            </p>
          ))}
          {data.invalid.map((l) => (
            <p key={l.line} className="text-danger">{t("invalidLine", { line: l.line, value: l.value })}</p>
          ))}
          {data.tooMany ? <p className="text-warning">{t("tooMany")}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}
