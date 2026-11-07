"use client";

import type { EmailDoc } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmailEditor } from "@/components/email/EmailEditor";
import { EmailPreview } from "@/components/email/EmailPreview";
import {
  FormError,
  SubmitButton,
  useActionForm,
  useFieldError,
} from "@/components/forms";
import { buttonClass } from "@/components/ui/Button";
import {
  SavedNote,
  SectionTitle,
  SettingsRow,
  SwitchRow,
} from "@/components/ui/Controls";
import { Field, Input } from "@/components/ui/Field";
import { marketingAutomationAction } from "@/app/o/[orgSlug]/events/actions";

type Automation = {
  type: "POST_EVENT" | "LAST_TICKETS";
  enabled: boolean;
  subject: string;
  content: EmailDoc;
  sent: boolean;
};

function AutomationForm({
  orgSlug,
  eventId,
  a,
}: {
  orgSlug: string;
  eventId: string;
  a: Automation;
}) {
  const t = useTranslations("marketingAutomations");
  const te = useTranslations("emailEditor");
  const [subject, setSubject] = useState(a.subject);
  const [content, setContent] = useState<EmailDoc>(a.content);
  const [preview, setPreview] = useState(false);
  // dernières places : la carte de l'événement, ajoutée à l'envoi, figure aussi dans l'aperçu
  const shown: EmailDoc =
    a.type === "LAST_TICKETS"
      ? {
          type: "doc",
          content: [
            ...content.content,
            { type: "eventCard", attrs: { eventId } },
          ],
        }
      : content;
  const { state, pending, formProps } = useActionForm(
    marketingAutomationAction.bind(null, orgSlug, eventId, a.type),
    null,
  );
  const error = useFieldError(state);
  return (
    // refonte A3 (maquette « Réglages de l'événement ») : une rangée par e-mail, l'éditeur sur toute la largeur
    <SettingsRow
      title={t(`type_${a.type}`)}
      description={a.sent ? t("sent") : t(`when_${a.type}`)}
      wide
    >
      <form {...formProps} className="grid gap-3.5" noValidate>
        <SwitchRow
          name="enabled"
          defaultChecked={a.enabled}
          label={t("enable", { type: t(`type_${a.type}`) })}
        />
        <FormError state={state} />
        <Field
          label={t("subject")}
          htmlFor={`${a.type}-subject`}
          error={error("subject")}
        >
          <Input
            id={`${a.type}-subject`}
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
          />
        </Field>
        <div className="grid gap-1.5">
          <span className="text-[length:var(--label-size)] [font-weight:var(--label-weight)]">
            {t("message")}
          </span>
          <input type="hidden" name="content" value={JSON.stringify(content)} />
          <EmailEditor
            orgSlug={orgSlug}
            value={a.content}
            onChange={setContent}
            events={[]}
          />
          <p className="-mt-px text-[length:var(--hint-size)] text-ink-muted">
            {t("messageHint")}
          </p>
          {error("content") ? (
            <p className="text-[13px] text-danger" role="alert">
              {error("content")}
            </p>
          ) : null}
          {preview && (
            <EmailPreview
              orgSlug={orgSlug}
              subject={subject}
              previewText=""
              content={shown}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pending={pending} variant="secondary">
            {t("save")}
          </SubmitButton>
          <button
            type="button"
            aria-expanded={preview}
            onClick={() => setPreview((v) => !v)}
            className={buttonClass("ghost")}
          >
            {te("preview")}
          </button>
          {state?.ok ? (
            <SavedNote id={`automation-${a.type}`}>{t("saved")}</SavedNote>
          ) : null}
        </div>
      </form>
    </SettingsRow>
  );
}

/** US-MKT-02 et dernières places : e-mails marketing de l'événement (consentement exigé), désactivés par défaut. */
export function EventMarketingEmails({
  orgSlug,
  eventId,
  automations,
}: {
  orgSlug: string;
  eventId: string;
  automations: Automation[];
}) {
  const t = useTranslations("marketingAutomations");
  return (
    <>
      <div className="pt-6 pb-1">
        <SectionTitle title={t("title")} />
        <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
      </div>
      {automations.map((a) => (
        <AutomationForm
          key={a.type}
          orgSlug={orgSlug}
          eventId={eventId}
          a={a}
        />
      ))}
    </>
  );
}
