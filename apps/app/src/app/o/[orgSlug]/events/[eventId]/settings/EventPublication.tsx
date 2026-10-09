"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { previewLinkAction, savePublicationAction } from "@/app/o/[orgSlug]/events/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";

type Props = {
  orgSlug: string;
  eventId: string;
  timezone: string;
  publishLocal: string | null;
  mode: "HIDDEN" | "TEASER";
  teaserText: string | null;
  previewUrl: string | null;
  status: string | null;
  waiting: number;
  readOnly: boolean;
};

/** Publication programmée (RG-PRG-01 à 03) : date, présentation avant publication et lien d'aperçu secret. */
export function EventPublication(p: Props) {
  const t = useTranslations("publication");
  const te = useTranslations("errors");
  const [scheduled, setScheduled] = useState(!!p.publishLocal);
  const [when, setWhen] = useState(p.publishLocal ?? "");
  const [mode, setMode] = useState(p.mode);
  const [text, setText] = useState(p.teaserText ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const fail = (code: string) => (code && te.has(code) ? te(code) : t("error"));
  const save = () =>
    start(async () => {
      const r = await savePublicationAction(p.orgSlug, p.eventId, {
        publishLocal: scheduled && when ? when : null,
        mode,
        teaserText: mode === "TEASER" && text.trim() ? text.trim() : null,
      });
      setMsg(r?.ok ? { ok: true, text: t("saved") } : { ok: false, text: fail(r && !r.ok ? r.error : "") });
    });
  const preview = (enable: boolean) =>
    start(async () => {
      const r = await previewLinkAction(p.orgSlug, p.eventId, enable);
      if (r && !r.ok) setMsg({ ok: false, text: fail(r.error) });
    });
  const copy = async () => {
    if (!p.previewUrl) return;
    await navigator.clipboard.writeText(p.previewUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Card className="mt-6">
      <div className="grid gap-5">
        <div className="grid gap-1">
          <h2 className="font-display text-xl tracking-[-0.02em]">{t("title")}</h2>
          <p className="text-sm text-ink-muted">{t("intro")}</p>
        </div>
        {p.status ? (
          <p role="status" className="rounded-md bg-info-soft px-3 py-2 text-sm">
            {p.status}
            {p.waiting > 0 ? ` ${t("alertsWaiting", { count: p.waiting })}` : ""}
          </p>
        ) : null}
        <fieldset className="grid gap-2" disabled={p.readOnly}>
          <legend className="mb-1 text-sm font-semibold">{t("whenLabel")}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="publication-when" checked={!scheduled} onChange={() => setScheduled(false)} />
            {t("optNow")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="publication-when" checked={scheduled} onChange={() => setScheduled(true)} />
            {t("optScheduled")}
          </label>
          {scheduled ? (
            <Field label={t("dateLabel", { tz: p.timezone })} htmlFor="publishLocal">
              <Input id="publishLocal" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
            </Field>
          ) : null}
        </fieldset>
        {scheduled ? (
          <fieldset className="grid gap-3" disabled={p.readOnly}>
            <legend className="mb-1 text-sm font-semibold">{t("beforeLabel")}</legend>
            {(["HIDDEN", "TEASER"] as const).map((m) => (
              <label key={m} className="flex items-start gap-2 text-sm">
                <input type="radio" name="publication-mode" className="mt-1" checked={mode === m} onChange={() => setMode(m)} />
                <span className="grid gap-0.5">
                  <span className="font-medium">{t(m === "HIDDEN" ? "modeHidden" : "modeTeaser")}</span>
                  <span className="text-ink-muted">{t(m === "HIDDEN" ? "modeHiddenHint" : "modeTeaserHint")}</span>
                </span>
              </label>
            ))}
            {mode === "TEASER" ? (
              <Field label={t("teaserLabel")} htmlFor="teaserText">
                <Input
                  id="teaserText"
                  type="text"
                  maxLength={160}
                  value={text}
                  placeholder={t("teaserPlaceholder")}
                  onChange={(e) => setText(e.target.value)}
                />
              </Field>
            ) : null}
          </fieldset>
        ) : null}
        <p className="text-sm text-ink-muted">{t("salesHint")}</p>
        {!p.readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={save} disabled={pending || (scheduled && !when)}>
              {t("save")}
            </Button>
            {msg ? (
              <p role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>
                {msg.text}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-2 border-t border-line pt-4">
          <h3 className="font-semibold">{t("previewTitle")}</h3>
          <p className="text-sm text-ink-muted">{t("previewIntro")}</p>
          {p.previewUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input readOnly value={p.previewUrl} aria-label={t("previewTitle")} className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="secondary" onClick={copy}>
                {copied ? t("previewCopied") : t("previewCopy")}
              </Button>
              {!p.readOnly ? (
                <Button type="button" variant="secondary" onClick={() => preview(false)} disabled={pending}>
                  {t("previewRevoke")}
                </Button>
              ) : null}
            </div>
          ) : !p.readOnly ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => preview(true)} disabled={pending}>
                {t("previewCreate")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
