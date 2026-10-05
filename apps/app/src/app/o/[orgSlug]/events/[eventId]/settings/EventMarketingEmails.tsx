"use client";

import { useTranslations } from "next-intl";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { marketingAutomationAction } from "@/app/o/[orgSlug]/events/actions";

type Automation = { type: "POST_EVENT" | "LAST_TICKETS"; enabled: boolean; subject: string; message: string; sent: boolean };

function AutomationForm({ orgSlug, eventId, a }: { orgSlug: string; eventId: string; a: Automation }) {
  const t = useTranslations("marketingAutomations");
  const { state, pending, formProps } = useActionForm(marketingAutomationAction.bind(null, orgSlug, eventId, a.type), null);
  const error = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-3 border-t border-line pt-3" noValidate>
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block font-semibold">{t(`type_${a.type}`)}</span>
          <span className="block text-sm text-ink-muted">{a.sent ? t("sent") : t(`when_${a.type}`)}</span>
        </span>
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={a.enabled}
          className="size-5 accent-[var(--ink)]"
          aria-label={t("enable", { type: t(`type_${a.type}`) })}
        />
      </label>
      <FormError state={state} />
      <Field label={t("subject")} htmlFor={`${a.type}-subject`} error={error("subject")}>
        <Input id={`${a.type}-subject`} name="subject" defaultValue={a.subject} maxLength={150} />
      </Field>
      <Field label={t("message")} htmlFor={`${a.type}-message`} hint={t("messageHint")} error={error("message")}>
        <textarea
          id={`${a.type}-message`}
          name="message"
          defaultValue={a.message}
          rows={4}
          maxLength={4000}
          className="block w-full rounded-md bg-surface-raised px-4 py-3 text-base shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]"
        />
      </Field>
      {state?.ok ? (
        <p className="text-sm text-success" role="status">
          {t("saved")}
        </p>
      ) : null}
      <SubmitButton pending={pending} variant="secondary" className="w-full sm:w-auto sm:justify-self-start">
        {t("save")}
      </SubmitButton>
    </form>
  );
}

/** US-MKT-02 et dernières places : e-mails marketing de l'événement (consentement exigé), désactivés par défaut. */
export function EventMarketingEmails({ orgSlug, eventId, automations }: { orgSlug: string; eventId: string; automations: Automation[] }) {
  const t = useTranslations("marketingAutomations");
  return (
    <Card className="mt-4 grid gap-3">
      <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("title")}</h2>
      <p className="-mt-1 text-sm text-ink-muted">{t("intro")}</p>
      {automations.map((a) => (
        <AutomationForm key={a.type} orgSlug={orgSlug} eventId={eventId} a={a} />
      ))}
    </Card>
  );
}
