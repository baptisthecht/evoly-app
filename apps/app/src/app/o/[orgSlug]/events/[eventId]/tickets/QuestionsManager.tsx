"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { questionCommandAction, saveQuestionAction } from "@/app/o/[orgSlug]/events/actions";

const TYPES = ["TEXT", "TEXTAREA", "SELECT", "MULTI_SELECT", "CHECKBOX", "NUMBER", "DATE", "PHONE", "EMAIL"] as const;
type Question = { id: string; label: string; helpText: string | null; type: (typeof TYPES)[number]; options: string[] | null; required: boolean; scope: "ORDER" | "TICKET"; ticketTypeIds: string[]; archived: boolean; answers: number };

function QuestionForm({ orgSlug, eventId, q, ticketTypes, onDone }: { orgSlug: string; eventId: string; q: Question | null; ticketTypes: Array<{ id: string; name: string }>; onDone: () => void }) {
  const t = useTranslations("questions");
  const [type, setType] = useState<Question["type"]>(q?.type ?? "TEXT");
  const { state, pending, formProps } = useActionForm(saveQuestionAction.bind(null, orgSlug, eventId, q?.id ?? null), null);
  const error = useFieldError(state);
  if (state?.ok) queueMicrotask(onDone);
  return (
    <form {...formProps} className="grid gap-4 rounded-md bg-surface-sunken p-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label={t("label")} htmlFor={`ql-${q?.id ?? "new"}`} error={error("label")}>
          <Input id={`ql-${q?.id ?? "new"}`} name="label" defaultValue={q?.label ?? ""} maxLength={200} />
        </Field>
        <Field label={t("type")} htmlFor={`qt-${q?.id ?? "new"}`}>
          <Select id={`qt-${q?.id ?? "new"}`} name="type" value={type} onChange={(e) => setType(e.target.value as Question["type"])}>
            {TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`type_${k}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {type === "SELECT" || type === "MULTI_SELECT" ? (
        <Field label={t("options")} htmlFor={`qo-${q?.id ?? "new"}`} hint={t("optionsHint")}>
          <textarea id={`qo-${q?.id ?? "new"}`} name="options" defaultValue={(q?.options ?? []).join("\n")} rows={4} className="block w-full rounded-md bg-surface-raised px-4 py-3 text-[0.95rem] shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]" />
        </Field>
      ) : null}
      <Field label={t("helpText")} htmlFor={`qh-${q?.id ?? "new"}`} hint={t("optional")}>
        <Input id={`qh-${q?.id ?? "new"}`} name="helpText" defaultValue={q?.helpText ?? ""} maxLength={300} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-label text-[0.8rem] font-bold">{t("scope")}</legend>
          {(["ORDER", "TICKET"] as const).map((s) => (
            <label key={s} className="flex items-center gap-3 text-sm">
              <input type="radio" name="scope" value={s} defaultChecked={(q?.scope ?? "ORDER") === s} className="size-5 accent-[var(--ink)]" />
              {t(`scope_${s}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-label text-[0.8rem] font-bold">{t("ticketTypes")}</legend>
          {ticketTypes.map((tt) => (
            <label key={tt.id} className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="ticketTypeIds" value={tt.id} defaultChecked={q?.ticketTypeIds.includes(tt.id)} className="size-5 accent-[var(--ink)]" />
              {tt.name}
            </label>
          ))}
          <p className="text-xs text-ink-muted">{t("ticketTypesHint")}</p>
        </fieldset>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="required" defaultChecked={q?.required} className="size-5 accent-[var(--ink)]" />
        {t("required")}
      </label>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} className="w-full sm:w-auto">
          {t("save")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="lg" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/** US-QST-01 et RG-QST-03 : questions du formulaire d'achat. */
export function QuestionsManager({ orgSlug, eventId, questions, ticketTypes, readOnly }: { orgSlug: string; eventId: string; questions: Question[]; ticketTypes: Array<{ id: string; name: string }>; readOnly: boolean }) {
  const t = useTranslations("questions");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const command = (id: string, c: "up" | "down" | "remove") =>
    start(async () => {
      const r = await questionCommandAction(orgSlug, eventId, id, c);
      if (r?.ok && c === "remove") setMessage(r.data.outcome === "ARCHIVED" ? t("archived") : t("deleted"));
    });
  const active = questions.filter((q) => !q.archived);
  return (
    <Card className="mt-10 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("title")}</h2>
        {questions.some((q) => q.answers > 0) ? (
          <a href={`/o/${orgSlug}/events/${eventId}/questions/export`} className="text-sm font-semibold underline underline-offset-4">
            {t("export")}
          </a>
        ) : null}
      </div>
      <p className="-mt-1 text-sm text-ink-muted">{t("intro")}</p>
      {message ? <p className="text-sm text-success" role="status">{message}</p> : null}
      <ul className="grid gap-2">
        {active.map((q, i) => (
          <li key={q.id} className="grid gap-2 border-t border-line pt-2">
            {editing === q.id ? (
              <QuestionForm orgSlug={orgSlug} eventId={eventId} q={q} ticketTypes={ticketTypes} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{q.label}</span>
                  <Badge>{t(`type_${q.type}`)}</Badge>
                  <Badge>{t(`scope_${q.scope}`)}</Badge>
                  {q.required ? <Badge tone="warning">{t("requiredBadge")}</Badge> : null}
                  <span className="text-xs text-ink-muted">{t("answers", { count: q.answers })}</span>
                </p>
                {!readOnly ? (
                  <span className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={pending || i === 0} onClick={() => command(q.id, "up")} aria-label={t("up")}>↑</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending || i === active.length - 1} onClick={() => command(q.id, "down")} aria-label={t("down")}>↓</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(q.id)}>{t("edit")}</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => (window.confirm(q.answers ? t("confirmArchive") : t("confirmDelete")) ? command(q.id, "remove") : undefined)}>{q.answers ? t("archive") : t("delete")}</Button>
                  </span>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!readOnly ? editing === "new" ? <QuestionForm orgSlug={orgSlug} eventId={eventId} q={null} ticketTypes={ticketTypes} onDone={() => setEditing(null)} /> : <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => setEditing("new")}>+ {t("add")}</Button> : null}
      {questions.some((q) => q.archived) ? <p className="text-xs text-ink-muted">{t("archivedCount", { count: questions.filter((q) => q.archived).length })}</p> : null}
    </Card>
  );
}
