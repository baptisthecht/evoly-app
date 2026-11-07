"use client";

import type { EmailDoc } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  previewEventEmailBlockAction,
  saveEventEmailBlockAction,
} from "@/app/o/[orgSlug]/events/actions";
import { EmailEditor } from "@/components/email/EmailEditor";
import { EmailPreview } from "@/components/email/EmailPreview";
import { Button, buttonClass } from "@/components/ui/Button";
import { SavedNote, SectionTitle, SettingsRow } from "@/components/ui/Controls";

type Kind = "ticket" | "reminder";

function Block({
  orgSlug,
  eventId,
  kind,
  initial,
}: {
  orgSlug: string;
  eventId: string;
  kind: Kind;
  initial: EmailDoc;
}) {
  const t = useTranslations("eventEmailBlocks");
  const te = useTranslations("emailEditor");
  const [content, setContent] = useState<EmailDoc>(initial);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const [pending, start] = useTransition();
  return (
    // refonte A3 (maquette « Réglages de l'événement ») : une rangée par e-mail, l'éditeur sur toute la largeur
    <SettingsRow
      title={t(kind)}
      description={t(kind === "ticket" ? "ticketHint" : "reminderHint")}
      wide
    >
      <EmailEditor
        orgSlug={orgSlug}
        value={initial}
        onChange={(d) => {
          setContent(d);
          setStatus(null);
        }}
        events={[]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveEventEmailBlockAction(
                orgSlug,
                eventId,
                kind,
                content,
              );
              setStatus(r?.ok ? "saved" : "error");
            })
          }
        >
          {t("save")}
        </Button>
        <button
          type="button"
          aria-expanded={preview}
          onClick={() => setPreview((v) => !v)}
          className={buttonClass("ghost")}
        >
          {te("preview")}
        </button>
        {status === "saved" ? (
          <SavedNote id={`email-block-${kind}`}>{t(status)}</SavedNote>
        ) : status ? (
          <span role="status" className="text-[13px] text-danger">
            {t(status)}
          </span>
        ) : null}
      </div>
      {preview && (
        <EmailPreview
          orgSlug={orgSlug}
          subject=""
          previewText=""
          content={content}
          action={(input) =>
            previewEventEmailBlockAction(orgSlug, eventId, kind, input)
          }
        />
      )}
    </SettingsRow>
  );
}

/** Message personnalisé dans les e-mails des participants : e-mail des billets et e-mails de rappel (toutes les offres). */
export function EventEmailBlocks({
  orgSlug,
  eventId,
  ticket,
  reminder,
}: {
  orgSlug: string;
  eventId: string;
  ticket: EmailDoc;
  reminder: EmailDoc;
}) {
  const t = useTranslations("eventEmailBlocks");
  return (
    <>
      <div className="pb-1">
        <SectionTitle title={t("title")} />
        <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
      </div>
      <Block
        orgSlug={orgSlug}
        eventId={eventId}
        kind="ticket"
        initial={ticket}
      />
      <Block
        orgSlug={orgSlug}
        eventId={eventId}
        kind="reminder"
        initial={reminder}
      />
    </>
  );
}
