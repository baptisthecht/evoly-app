"use client";

import type { EmailDoc } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { previewEventEmailBlockAction, saveEventEmailBlockAction } from "@/app/o/[orgSlug]/events/actions";
import { EmailEditor } from "@/components/email/EmailEditor";
import { EmailPreview } from "@/components/email/EmailPreview";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Kind = "ticket" | "reminder";

function Block({ orgSlug, eventId, kind, initial }: { orgSlug: string; eventId: string; kind: Kind; initial: EmailDoc }) {
  const t = useTranslations("eventEmailBlocks");
  const te = useTranslations("emailEditor");
  const [content, setContent] = useState<EmailDoc>(initial);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="grid gap-2 border-t border-line pt-3" aria-label={t(kind)}>
      <h3 className="font-semibold">{t(kind)}</h3>
      <p className="-mt-1 text-sm text-ink-muted">{t(kind === "ticket" ? "ticketHint" : "reminderHint")}</p>
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
              const r = await saveEventEmailBlockAction(orgSlug, eventId, kind, content);
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
          className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-sunken"
        >
          {te("preview")}
        </button>
        {status && (
          <span role="status" className={`text-sm ${status === "saved" ? "text-success" : "text-danger"}`}>
            {t(status)}
          </span>
        )}
      </div>
      {preview && (
        <EmailPreview
          orgSlug={orgSlug}
          subject=""
          previewText=""
          content={content}
          action={(input) => previewEventEmailBlockAction(orgSlug, eventId, kind, input)}
        />
      )}
    </section>
  );
}

/** Message personnalisé dans les e-mails des participants : e-mail des billets et e-mails de rappel (toutes les offres). */
export function EventEmailBlocks({ orgSlug, eventId, ticket, reminder }: { orgSlug: string; eventId: string; ticket: EmailDoc; reminder: EmailDoc }) {
  const t = useTranslations("eventEmailBlocks");
  return (
    <Card className="mt-4 grid gap-3">
      <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("title")}</h2>
      <p className="-mt-1 text-sm text-ink-muted">{t("intro")}</p>
      <Block orgSlug={orgSlug} eventId={eventId} kind="ticket" initial={ticket} />
      <Block orgSlug={orgSlug} eventId={eventId} kind="reminder" initial={reminder} />
    </Card>
  );
}
