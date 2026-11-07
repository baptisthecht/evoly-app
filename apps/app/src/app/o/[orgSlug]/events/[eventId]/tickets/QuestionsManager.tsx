"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { BarActions } from "@/components/shell/EventTabs";
import { Button, buttonClass } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { SavedNote } from "@/components/ui/Controls";
import { Field, Input, Select, TEXTAREA_CLASS } from "@/components/ui/Field";
import {
  questionCommandAction,
  saveQuestionAction,
} from "@/app/o/[orgSlug]/events/actions";
import { DownloadIcon, PlusIcon } from "@/components/ui/icons";

const TYPES = [
  "TEXT",
  "TEXTAREA",
  "SELECT",
  "MULTI_SELECT",
  "CHECKBOX",
  "NUMBER",
  "DATE",
  "PHONE",
  "EMAIL",
] as const;
type Question = {
  id: string;
  label: string;
  helpText: string | null;
  type: (typeof TYPES)[number];
  options: string[] | null;
  required: boolean;
  scope: "ORDER" | "TICKET";
  ticketTypeIds: string[];
  archived: boolean;
  answers: number;
};

function QuestionForm({
  orgSlug,
  eventId,
  q,
  ticketTypes,
  onDone,
}: {
  orgSlug: string;
  eventId: string;
  q: Question | null;
  ticketTypes: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const t = useTranslations("questions");
  const [type, setType] = useState<Question["type"]>(q?.type ?? "TEXT");
  const { state, pending, formProps } = useActionForm(
    saveQuestionAction.bind(null, orgSlug, eventId, q?.id ?? null),
    null,
  );
  const error = useFieldError(state);
  // fermeture après l'enregistrement : dans un effet, jamais pendant l'affichage (affiché deux fois en mode strict, elle
  // serait demandée deux fois)
  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const formId = `question-form-${q?.id ?? "new"}`;
  // refonte A3 (maquette « Nouveau tarif ») : les champs dans la fenêtre, les boutons dans son pied (DialogFooter)
  return (
    <form id={formId} {...formProps} className="grid gap-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field
          label={t("label")}
          htmlFor={`ql-${q?.id ?? "new"}`}
          error={error("label")}
        >
          <Input
            id={`ql-${q?.id ?? "new"}`}
            name="label"
            defaultValue={q?.label ?? ""}
            maxLength={200}
          />
        </Field>
        <Field label={t("type")} htmlFor={`qt-${q?.id ?? "new"}`}>
          <Select
            id={`qt-${q?.id ?? "new"}`}
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as Question["type"])}
          >
            {TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`type_${k}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {type === "SELECT" || type === "MULTI_SELECT" ? (
        <Field
          label={t("options")}
          htmlFor={`qo-${q?.id ?? "new"}`}
          hint={t("optionsHint")}
        >
          <textarea
            id={`qo-${q?.id ?? "new"}`}
            name="options"
            defaultValue={(q?.options ?? []).join("\n")}
            rows={4}
            className={TEXTAREA_CLASS}
          />
        </Field>
      ) : null}
      <Field
        label={t("helpText")}
        htmlFor={`qh-${q?.id ?? "new"}`}
        hint={t("optional")}
      >
        <Input
          id={`qh-${q?.id ?? "new"}`}
          name="helpText"
          defaultValue={q?.helpText ?? ""}
          maxLength={300}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="grid content-start gap-2">
          <legend className="mb-1 font-label text-[0.8rem] font-bold">
            {t("scope")}
          </legend>
          {(["ORDER", "TICKET"] as const).map((s) => (
            <label key={s} className="flex items-center gap-3 text-sm">
              <input
                type="radio"
                name="scope"
                value={s}
                defaultChecked={(q?.scope ?? "ORDER") === s}
                className="size-5 accent-[var(--ink)]"
              />
              {t(`scope_${s}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className="grid content-start gap-2">
          <legend className="mb-1 font-label text-[0.8rem] font-bold">
            {t("ticketTypes")}
          </legend>
          {ticketTypes.map((tt) => (
            <label key={tt.id} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="ticketTypeIds"
                value={tt.id}
                defaultChecked={q?.ticketTypeIds.includes(tt.id)}
                className="size-5 accent-[var(--ink)]"
              />
              {tt.name}
            </label>
          ))}
          <p className="text-[12.5px] text-ink-muted">{t("ticketTypesHint")}</p>
        </fieldset>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="required"
          defaultChecked={q?.required}
          className="size-5 accent-[var(--ink)]"
        />
        {t("required")}
      </label>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          disabled={pending}
          aria-busy={pending}
        >
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** US-QST-01 et RG-QST-03 : questions du formulaire d'achat. */
export function QuestionsManager({
  orgSlug,
  eventId,
  questions,
  ticketTypes,
  readOnly,
}: {
  orgSlug: string;
  eventId: string;
  questions: Question[];
  ticketTypes: Array<{ id: string; name: string }>;
  readOnly: boolean;
}) {
  const t = useTranslations("questions");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const command = (id: string, c: "up" | "down" | "remove") =>
    start(async () => {
      const r = await questionCommandAction(orgSlug, eventId, id, c);
      if (r?.ok && c === "remove")
        setMessage(
          r.data.outcome === "ARCHIVED" ? t("archived") : t("deleted"),
        );
    });
  const active = questions.filter((q) => !q.archived);
  const current =
    editing && editing !== "new"
      ? (active.find((q) => q.id === editing) ?? null)
      : null;
  const columns: TableColumn<Question>[] = [
    {
      key: "label",
      header: t("tableQuestion"),
      mobile: "title",
      cell: (q) => (
        <span className="grid min-w-0">
          <span className="font-semibold">{q.label}</span>
          {q.helpText ? (
            <span className="truncate text-sm text-ink-muted">
              {q.helpText}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "type",
      header: t("tableType"),
      mobile: "badge",
      cell: (q) => (
        <span className="flex flex-wrap gap-1.5">
          <Badge tone="info">{t(`type_${q.type}`)}</Badge>
          <Badge tone={q.scope === "TICKET" ? "lilas" : "neutral"}>
            {t(`scope_${q.scope}`)}
          </Badge>
          {q.required ? (
            <Badge tone="warning">{t("requiredBadge")}</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "answers",
      header: t("tableAnswers"),
      align: "right",
      width: "7rem",
    },
  ];
  if (!readOnly)
    columns.push({
      key: "actions",
      header: <span className="sr-only">{t("tableActions")}</span>,
      align: "right",
      cell: (q) => {
        const i = active.indexOf(q);
        return (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || i === 0}
              onClick={() => command(q.id, "up")}
              aria-label={t("up")}
            >
              ↑
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || i === active.length - 1}
              onClick={() => command(q.id, "down")}
              aria-label={t("down")}
            >
              ↓
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(q.id)}
            >
              {t("edit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                window.confirm(
                  q.answers ? t("confirmArchive") : t("confirmDelete"),
                )
                  ? command(q.id, "remove")
                  : undefined
              }
            >
              {q.answers ? t("archive") : t("delete")}
            </Button>
          </span>
        );
      },
    });
  const exportable = questions.some((q) => q.answers > 0);
  // refonte A3 (maquette « Tarifs ») : les boutons de la page à droite des onglets en boutons (BarActions)
  return (
    <>
      {exportable || !readOnly ? (
        <BarActions>
          {exportable ? (
            <a
              href={`/o/${orgSlug}/events/${eventId}/questions/export`}
              className={buttonClass("secondary")}
            >
              <DownloadIcon />
              {t("export")}
            </a>
          ) : null}
          {!readOnly ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => setEditing("new")}
            >
              <PlusIcon />
              {t("add")}
            </Button>
          ) : null}
        </BarActions>
      ) : null}
      <div className="grid gap-3.5">
        <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
        {message ? (
          <SavedNote id="questions-status">{message}</SavedNote>
        ) : null}
        {/* l'ordre des questions est celui du formulaire d'achat : pas de tri */}
        <DataTable
          rows={active}
          columns={columns}
          getRowId={(q) => q.id}
          caption={t("title")}
          emptyState={{ title: t("emptyTitle"), description: t("intro") }}
        />
        {questions.some((q) => q.archived) ? (
          <p className="text-[12.5px] text-ink-muted">
            {t("archivedCount", {
              count: questions.filter((q) => q.archived).length,
            })}
          </p>
        ) : null}
        <Dialog
          open={editing !== null}
          onClose={() => setEditing(null)}
          title={current ? t("edit") : t("add")}
          size="lg"
        >
          {editing !== null ? (
            <QuestionForm
              orgSlug={orgSlug}
              eventId={eventId}
              q={current}
              ticketTypes={ticketTypes}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </Dialog>
      </div>
    </>
  );
}
