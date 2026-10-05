"use client";

import type { EmailDoc } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmailEditor } from "@/components/email/EmailEditor";
import { EmailPreview } from "@/components/email/EmailPreview";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { marketingAutomationAction } from "@/app/o/[orgSlug]/events/actions";

type Automation = { type: "POST_EVENT" | "LAST_TICKETS"; enabled: boolean; subject: string; content: EmailDoc; sent: boolean };

function AutomationForm({ orgSlug, eventId, a }: { orgSlug: string; eventId: string; a: Automation }) {
  const t = useTranslations("marketingAutomations");
  const te = useTranslations("emailEditor");
  const [subject, setSubject] = useState(a.subject);
  const [content, setContent] = useState<EmailDoc>(a.content);
  const [preview, setPreview] = useState(false);
  // dernières places : la carte de l'événement, ajoutée à l'envoi, figure aussi dans l'aperçu
  const shown: EmailDoc = a.type === "LAST_TICKETS" ? { type: "doc", content: [...content.content, { type: "eventCard", attrs: { eventId } }] } : content;
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
        <Input id={`${a.type}-subject`} name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
      </Field>
      <div className="grid gap-2">
        <span className="text-sm font-semibold">{t("message")}</span>
        <span className="-mt-1 text-sm text-ink-muted">{t("messageHint")}</span>
        <input type="hidden" name="content" value={JSON.stringify(content)} />
        <EmailEditor orgSlug={orgSlug} value={a.content} onChange={setContent} events={[]} />
        {error("content") ? (
          <p className="text-sm text-danger" role="alert">
            {error("content")}
          </p>
        ) : null}
        <button
          type="button"
          aria-expanded={preview}
          onClick={() => setPreview((v) => !v)}
          className="justify-self-start rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-sunken"
        >
          {te("preview")}
        </button>
        {preview && <EmailPreview orgSlug={orgSlug} subject={subject} previewText="" content={shown} />}
      </div>
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
