"use client";

import { LOCALE_NAMES, LOCALES } from "@evoly/i18n";
import type { CampaignSegment, EmailDoc } from "@evoly/core";
import { EmailEditor } from "@/components/email/EmailEditor";
import { EmailPreview } from "@/components/email/EmailPreview";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  audienceAction,
  deleteCampaignAction,
  previewAction,
  saveCampaignAction,
  saveTemplateAction,
  scheduleAction,
  testAction,
  unscheduleAction,
} from "./actions";
import { uploadFile } from "@/app/o/[orgSlug]/brand/BrandClient";

type EventOption = { id: string; title: string };
type Values = { name: string; subject: string; previewText: string; content: EmailDoc; segment: CampaignSegment };

const textarea =
  "block w-full rounded-md bg-surface-raised px-4 py-3 text-base shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]";

/** US-MKT-03 : éditeur par blocs, destinataires, aperçu, test, envoi immédiat ou programmé. */
export function CampaignEditor({
  orgSlug,
  id,
  status,
  scheduledAt,
  initial,
  events,
  ticketTypes = [],
  userEmail,
}: {
  orgSlug: string;
  id: string | null;
  status: string;
  scheduledAt: string | null;
  initial: Values;
  events: EventOption[];
  ticketTypes?: Array<{ id: string; name: string; eventId: string }>;
  userEmail: string;
}) {
  const t = useTranslations("campaigns");
  const tf = useTranslations("formErrors");
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [count, setCount] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ html: string; width: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [at, setAt] = useState("");
  const [pending, start] = useTransition();
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  useEffect(() => {
    const h = setTimeout(async () => setCount(await audienceAction(orgSlug, v.segment)), 300);
    return () => clearTimeout(h);
  }, [orgSlug, v.segment]);
  const fail = (err?: string, fields?: Record<string, string>) =>
    setMessage({ ok: false, text: fields && Object.keys(fields).length ? t("fixFields") : err && tf.has(err) ? tf(err) : t("error") });
  const save = async (): Promise<string | null> => {
    const r = await saveCampaignAction(orgSlug, id, v);
    if (!r?.ok) {
      fail(r?.error, r && !r.ok ? r.fields : undefined);
      return null;
    }
    if (!id) router.replace(`/o/${orgSlug}/marketing/campaigns/${r.data.id}`);
    return r.data.id;
  };
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setMessage(null);
      await fn();
    });
  const locked = ["SENDING", "SENT", "CANCELLED", "FAILED"].includes(status);
  if (locked) return null;
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="grid content-start gap-5">
          <Card className="grid gap-4">
            <Field label={t("name")} htmlFor="c-name" hint={t("nameHint")}>
              <Input id="c-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} />
            </Field>
            <Field label={t("subject")} htmlFor="c-subject" hint={t("mergeHint")}>
              <Input id="c-subject" value={v.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={150} />
            </Field>
            <Field label={t("previewText")} htmlFor="c-preview" hint={t("previewTextHint")}>
              <Input id="c-preview" value={v.previewText} onChange={(e) => set({ previewText: e.target.value })} maxLength={200} />
            </Field>
          </Card>
          <section className="grid gap-4" aria-label={t("content")}>
            <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("content")}</h2>
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <EmailEditor orgSlug={orgSlug} value={v.content} onChange={(content) => set({ content })} events={events} />
              <EmailPreview orgSlug={orgSlug} subject={v.subject} previewText={v.previewText} content={v.content} />
            </div>
          </section>
        </div>
        <aside className="grid content-start gap-4 lg:sticky lg:top-6">
          <Card className="grid gap-3">
            <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("audience")}</h2>
            <Select
              aria-label={t("audience")}
              value={v.segment.kind}
              onChange={(e) =>
                set({
                  segment:
                    e.target.value === "EVENTS"
                      ? { kind: "EVENTS", eventIds: events[0] ? [events[0].id] : [], attendance: "ANY", locale: v.segment.locale ?? null }
                      : { kind: "ALL_CONSENTING", locale: v.segment.locale ?? null },
                })
              }
            >
              <option value="ALL_CONSENTING">{t("audience_ALL")}</option>
              <option value="EVENTS" disabled={events.length === 0}>
                {t("audience_EVENTS")}
              </option>
            </Select>
            {v.segment.kind === "EVENTS" ? (
              <>
                <fieldset className="grid max-h-48 gap-2 overflow-y-auto">
                  <legend className="sr-only">{t("events")}</legend>
                  {events.map((e) => {
                    const seg = v.segment as Extract<CampaignSegment, { kind: "EVENTS" }>;
                    return (
                      <label key={e.id} className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--ink)]"
                          checked={seg.eventIds.includes(e.id)}
                          onChange={(x) =>
                            set({ segment: { ...seg, eventIds: x.target.checked ? [...seg.eventIds, e.id] : seg.eventIds.filter((k) => k !== e.id) } })
                          }
                        />
                        {e.title}
                      </label>
                    );
                  })}
                </fieldset>
                {ticketTypes.some((tt) => (v.segment as Extract<CampaignSegment, { kind: "EVENTS" }>).eventIds.includes(tt.eventId)) ? (
                  <fieldset className="grid gap-2">
                    <legend className="mb-1 text-sm font-semibold">{t("ticketTypes")}</legend>
                    {ticketTypes
                      .filter((tt) => (v.segment as Extract<CampaignSegment, { kind: "EVENTS" }>).eventIds.includes(tt.eventId))
                      .map((tt) => {
                        const seg = v.segment as Extract<CampaignSegment, { kind: "EVENTS" }>;
                        const ids = seg.ticketTypeIds ?? [];
                        return (
                          <label key={tt.id} className="flex items-center gap-3 text-sm">
                            <input
                              type="checkbox"
                              className="size-5 accent-[var(--ink)]"
                              checked={ids.includes(tt.id)}
                              onChange={(x) => {
                                const next = x.target.checked ? [...ids, tt.id] : ids.filter((k) => k !== tt.id);
                                set({ segment: { ...seg, ticketTypeIds: next.length ? next : undefined } });
                              }}
                            />
                            {tt.name}
                          </label>
                        );
                      })}
                    <p className="text-xs text-ink-muted">{t("ticketTypesHint")}</p>
                  </fieldset>
                ) : null}
                <Select
                  aria-label={t("attendance")}
                  value={(v.segment as Extract<CampaignSegment, { kind: "EVENTS" }>).attendance ?? "ANY"}
                  onChange={(e) => set({ segment: { ...(v.segment as Extract<CampaignSegment, { kind: "EVENTS" }>), attendance: e.target.value as "ANY" } })}
                >
                  <option value="ANY">{t("attendance_ANY")}</option>
                  <option value="PRESENT">{t("attendance_PRESENT")}</option>
                  <option value="ABSENT">{t("attendance_ABSENT")}</option>
                </Select>
              </>
            ) : null}
            <Select
              aria-label={t("language")}
              value={v.segment.locale ?? ""}
              onChange={(e) => set({ segment: { ...v.segment, locale: (e.target.value || null) as "fr" | null } })}
            >
              <option value="">{t("language_ALL")}</option>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </Select>
            <p className="text-sm font-semibold" data-testid="audience-count">
              {count == null ? "…" : t("recipients", { count })}
            </p>
            <p className="text-xs text-ink-muted">{t("audienceHint")}</p>
          </Card>
          <Card className="grid gap-2">
            <Button
              type="button"
              onClick={() =>
                run(async () => {
                  if (await save()) setMessage({ ok: true, text: t("saved") });
                })
              }
              disabled={pending}
            >
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await saveTemplateAction(orgSlug, { name: v.name, subject: v.subject, previewText: v.previewText, content: v.content });
                  if (r?.ok) setMessage({ ok: true, text: t("templateSaved") });
                  else fail(r?.error, r && !r.ok ? r.fields : undefined);
                })
              }
            >
              {t("saveAsTemplate")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !id}
              onClick={() =>
                run(async () => {
                  const saved = await save();
                  if (!saved) return;
                  const r = await previewAction(orgSlug, saved);
                  if (r?.ok) setPreview({ html: r.data.html, width: 600 });
                  else fail(r?.error);
                })
              }
            >
              {t("preview")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !id}
              onClick={() =>
                run(async () => {
                  const saved = await save();
                  if (!saved) return;
                  const r = await testAction(orgSlug, saved);
                  if (r?.ok) setMessage({ ok: true, text: t("testSent", { email: r.data.to }) });
                  else fail(r?.error);
                })
              }
            >
              {t("sendTest", { email: userEmail })}
            </Button>
            {status === "SCHEDULED" ? (
              <>
                <p className="text-sm">{t("scheduledFor", { date: scheduledAt ? new Date(scheduledAt).toLocaleString() : "" })}</p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const r = await unscheduleAction(orgSlug, id!);
                      if (r?.ok) router.refresh();
                      else fail(r?.error);
                    })
                  }
                >
                  {t("unschedule")}
                </Button>
              </>
            ) : (
              <>
                <Field label={t("scheduleAt")} htmlFor="c-at">
                  <Input id="c-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
                </Field>
                <Button
                  type="button"
                  variant="dark"
                  disabled={pending || !id || !count}
                  onClick={() =>
                    run(async () => {
                      const saved = await save();
                      if (!saved) return;
                      const when = at ? new Date(at).toISOString() : null;
                      if (!when && !window.confirm(t("confirmSendNow", { count: count ?? 0 }))) return;
                      const r = await scheduleAction(orgSlug, saved, when);
                      if (r?.ok) router.refresh();
                      else fail(r?.error);
                    })
                  }
                >
                  {at ? t("schedule") : t("sendNow")}
                </Button>
                {id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        if (!window.confirm(t("confirmDelete"))) return;
                        const r = await deleteCampaignAction(orgSlug, id);
                        if (r?.ok) router.push(`/o/${orgSlug}/marketing?tab=campaigns`);
                        else fail(r?.error);
                      })
                    }
                  >
                    {t("delete")}
                  </Button>
                ) : null}
              </>
            )}
            {!id ? <p className="text-xs text-ink-muted">{t("saveFirst")}</p> : null}
            {message ? (
              <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
                {message.text}
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
      {preview ? (
        <Card className="grid gap-2">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={preview.width === 600 ? "dark" : "ghost"} onClick={() => setPreview({ ...preview, width: 600 })}>
              {t("desktop")}
            </Button>
            <Button type="button" size="sm" variant={preview.width === 375 ? "dark" : "ghost"} onClick={() => setPreview({ ...preview, width: 375 })}>
              {t("mobile")}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md bg-surface-sunken p-4">
            <iframe
              title={t("preview")}
              srcDoc={preview.html}
              sandbox=""
              style={{ width: preview.width, height: 640 }}
              className="mx-auto block rounded-md bg-blanc ring-1 ring-line"
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
