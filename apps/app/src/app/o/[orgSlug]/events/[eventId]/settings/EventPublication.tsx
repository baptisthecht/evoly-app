"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  previewLinkAction,
  savePublicationAction,
} from "@/app/o/[orgSlug]/events/actions";
import { Button } from "@/components/ui/Button";
import { ExampleNote, SavedNote, SettingsRow } from "@/components/ui/Controls";
import { DateTimeField } from "@/components/ui/DateTimeField";
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
  const locale = useLocale();
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
      setMsg(
        r?.ok
          ? { ok: true, text: t("saved") }
          : { ok: false, text: fail(r && !r.ok ? r.error : "") },
      );
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
  // refonte A3 (maquette « Réglages de l'événement ») : deux rangées, le titre et l'explication à gauche
  const choice = "flex cursor-pointer items-start gap-3";
  // un fragment : les rangées s'enchaînent avec celles de la page (le filet de la dernière disparaît)
  return (
    <>
      <SettingsRow title={t("title")} description={t("intro")}>
        {p.status ? (
          <p role="status" className="text-[13px] text-ink-body">
            {p.status}
            {p.waiting > 0
              ? ` ${t("alertsWaiting", { count: p.waiting })}`
              : ""}
          </p>
        ) : null}
        <fieldset className="grid gap-2.5" disabled={p.readOnly}>
          <legend className="mb-1.5 text-[length:var(--label-size)] [font-weight:var(--label-weight)]">
            {t("whenLabel")}
          </legend>
          <label className={choice}>
            <input
              type="radio"
              name="publication-when"
              className="mt-0.5"
              checked={!scheduled}
              onChange={() => setScheduled(false)}
            />
            {t("optNow")}
          </label>
          <label className={choice}>
            <input
              type="radio"
              name="publication-when"
              className="mt-0.5"
              checked={scheduled}
              onChange={() => setScheduled(true)}
            />
            {t("optScheduled")}
          </label>
          {scheduled ? (
            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              <Field
                label={t("dateLabel", { tz: p.timezone })}
                htmlFor="publishLocal"
              >
                <DateTimeField
                  id="publishLocal"
                  locale={locale}
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  required
                />
              </Field>
            </div>
          ) : null}
        </fieldset>
        {scheduled ? (
          <fieldset className="grid gap-2.5" disabled={p.readOnly}>
            <legend className="mb-1.5 text-[length:var(--label-size)] [font-weight:var(--label-weight)]">
              {t("beforeLabel")}
            </legend>
            {(["HIDDEN", "TEASER"] as const).map((m) => (
              <label key={m} className={choice}>
                <input
                  type="radio"
                  name="publication-mode"
                  className="mt-0.5"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                <span className="min-w-0">
                  <span className="block font-medium">
                    {t(m === "HIDDEN" ? "modeHidden" : "modeTeaser")}
                  </span>
                  <small className="text-[12.5px] text-ink-muted">
                    {t(m === "HIDDEN" ? "modeHiddenHint" : "modeTeaserHint")}
                  </small>
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
        <ExampleNote>{t("salesHint")}</ExampleNote>
        {!p.readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={save}
              disabled={pending || (scheduled && !when)}
            >
              {t("save")}
            </Button>
            {msg ? (
              msg.ok ? (
                <SavedNote id="publication-status">{msg.text}</SavedNote>
              ) : (
                <p role="status" className="text-[13px] text-danger">
                  {msg.text}
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </SettingsRow>
      <SettingsRow title={t("previewTitle")} description={t("previewIntro")}>
        {p.previewUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">
              <Input
                readOnly
                value={p.previewUrl}
                aria-label={t("previewTitle")}
                onFocus={(e) => e.currentTarget.select()}
              />
            </span>
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? t("previewCopied") : t("previewCopy")}
            </Button>
            {!p.readOnly ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => preview(false)}
                disabled={pending}
              >
                {t("previewRevoke")}
              </Button>
            ) : null}
          </div>
        ) : !p.readOnly ? (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => preview(true)}
              disabled={pending}
            >
              {t("previewCreate")}
            </Button>
          </div>
        ) : null}
      </SettingsRow>
    </>
  );
}
