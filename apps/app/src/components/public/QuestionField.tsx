"use client";

import type { QuestionType } from "@evoly/core";
import { Input, Select } from "../ui/Field";

export type PublicQuestion = { id: string; label: string; helpText: string | null; type: QuestionType; required: boolean; options?: string[] | null };

/** Champ d'une question à l'achat (US-QST-01), selon son type. */
export function QuestionField({ q, id, value, onChange, error }: { q: PublicQuestion; id: string; value: unknown; onChange: (v: unknown) => void; error?: string | null }) {
  const label = (
    <span className="font-label text-[0.8rem] font-bold">
      {q.label}
      {q.required ? <span aria-hidden="true"> *</span> : null}
    </span>
  );
  const help = q.helpText ? <span className="text-xs text-ink-muted">{q.helpText}</span> : null;
  const err = error ? <span className="text-sm text-danger" role="alert">{error}</span> : null;
  if (q.type === "CHECKBOX")
    return (
      <div className="grid gap-1">
        <label className="flex items-start gap-3 text-sm">
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--ink)]" aria-invalid={!!error} />
          <span>
            {q.label}
            {q.required ? <span aria-hidden="true"> *</span> : null}
          </span>
        </label>
        {help}
        {err}
      </div>
    );
  if (q.type === "MULTI_SELECT") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="grid gap-2">
        <legend className="mb-1">{label}</legend>
        {(q.options ?? []).map((o) => (
          <label key={o} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={list.includes(o)} onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))} className="size-5 accent-[var(--ink)]" />
            {o}
          </label>
        ))}
        {help}
        {err}
      </fieldset>
    );
  }
  return (
    <label className="grid gap-1.5" htmlFor={id}>
      {label}
      {q.type === "SELECT" ? (
        <Select id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}>
          <option value="">—</option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : q.type === "TEXTAREA" ? (
        <textarea id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={2000} aria-invalid={!!error} className="block w-full rounded-md bg-surface-raised px-4 py-3 text-[0.95rem] shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]" />
      ) : (
        <Input
          id={id}
          type={q.type === "NUMBER" ? "text" : q.type === "DATE" ? "date" : q.type === "PHONE" ? "tel" : q.type === "EMAIL" ? "email" : "text"}
          inputMode={q.type === "NUMBER" ? "decimal" : q.type === "PHONE" ? "tel" : q.type === "EMAIL" ? "email" : undefined}
          value={typeof value === "string" ? value : value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          maxLength={q.type === "TEXT" ? 200 : 200}
          invalid={!!error}
        />
      )}
      {help}
      {err}
    </label>
  );
}
