"use client";

import { inkOn, palette } from "@evoly/ui";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { seatingCategoryAction, seatingCommandAction, seatingRowAction } from "@/app/o/[orgSlug]/events/actions";

type Seat = { id: string; label: string; status: "AVAILABLE" | "HELD" | "SOLD" | "BLOCKED" };
type Row = { id: string; name: string; categoryId: string; seats: Seat[] };
type Category = { id: string; name: string; color: string; ticketTypes: Array<{ id: string; name: string }> };

/** Section 9.9 (Pro) : plan de salle de l'événement — catégories, rangs, sièges bloqués, placement numéroté. */
export function SeatingManager({ orgSlug, eventId, assigned, allowChoice = false, categories, rows, ticketTypes, readOnly }: { orgSlug: string; eventId: string; assigned: boolean; allowChoice?: boolean; categories: Category[]; rows: Row[]; ticketTypes: Array<{ id: string; name: string }>; readOnly: boolean }) {
  const t = useTranslations("seating");
  const tf = useTranslations("formErrors");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cat = useActionForm(seatingCategoryAction.bind(null, orgSlug, eventId), null);
  const row = useActionForm(seatingRowAction.bind(null, orgSlug, eventId), null);
  // interrupteurs à jour tout de suite, remis en place si le serveur refuse
  const [mode, setMode] = useState(assigned);
  const [choice, setChoice] = useState(allowChoice);
  const run = (command: Parameters<typeof seatingCommandAction>[2], revert?: () => void) =>
    start(async () => {
      setError(null);
      const r = await seatingCommandAction(orgSlug, eventId, command);
      if (r && !r.ok) {
        revert?.();
        setError(tf.has(r.error) ? tf(r.error) : t("error"));
      }
    });
  const colorOf = (id: string) => categories.find((c) => c.id === id)?.color ?? palette.rose;
  const all = rows.flatMap((r) => r.seats);
  const count = (s: Seat["status"]) => all.filter((x) => x.status === s).length;
  return (
    <Card className="mt-10 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("title")}</h2>
        {!readOnly ? (
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={mode} disabled={pending} onChange={(e) => { const v = e.target.checked; setMode(v); if (!v) setChoice(false); run({ kind: "mode", assigned: v }, () => setMode(!v)); }} className="size-5 accent-[var(--ink)]" />
            {t("assigned")}
          </label>
        ) : null}
      </div>
      <p className="-mt-2 text-sm text-ink-muted">{t("intro")}</p>
      {mode && !readOnly ? (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={choice} disabled={pending} onChange={(e) => { const v = e.target.checked; setChoice(v); run({ kind: "choice", allow: v }, () => setChoice(!v)); }} className="size-5 accent-[var(--ink)]" />
          {t("allowChoice")}
        </label>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      {categories.length ? (
        <ul className="flex flex-wrap gap-2 text-sm">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-full px-3 py-1 ring-1 ring-line">
              <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden="true" />
              <span className="font-semibold">{c.name}</span>
              <span className="text-ink-muted">{c.ticketTypes.map((tt) => tt.name).join(", ") || t("noTicketType")}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {rows.length ? (
        <div className="grid gap-2 overflow-x-auto rounded-md bg-surface-sunken p-4" role="group" aria-label={t("map")}>
          <p className="mx-auto mb-2 w-2/3 rounded bg-surface-inverse py-1 text-center text-xs font-semibold text-ink-inverse">{t("stage")}</p>
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right text-sm font-bold">{r.name}</span>
              <div className="flex flex-nowrap gap-1">
                {r.seats.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={readOnly || pending || s.status === "SOLD" || s.status === "HELD"}
                    onClick={() => run({ kind: "seat", id: s.id })}
                    aria-label={t("seatLabel", { row: r.name, seat: s.label, status: t(`status_${s.status}`) })}
                    title={t("seatLabel", { row: r.name, seat: s.label, status: t(`status_${s.status}`) })}
                    className="grid size-8 place-items-center rounded-md text-[0.65rem] font-bold"
                    style={s.status === "AVAILABLE" ? { background: colorOf(r.categoryId), color: inkOn(colorOf(r.categoryId)) } : s.status === "BLOCKED" ? { background: "repeating-linear-gradient(45deg, var(--line-strong), var(--line-strong) 3px, var(--surface-sunken) 3px, var(--surface-sunken) 6px)", color: "var(--ink)" } : s.status === "HELD" ? { background: "var(--evoly-signal-warn)", color: "var(--evoly-blanc)" } : { background: "var(--surface-inverse)", color: "var(--ink-inverse)" }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {!readOnly && !r.seats.some((s) => s.status === "SOLD" || s.status === "HELD") ? (
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => (window.confirm(t("confirmDeleteRow", { row: r.name })) ? run({ kind: "row", id: r.id }) : undefined)}>
                  {t("deleteRow")}
                </Button>
              ) : null}
            </div>
          ))}
          <p className="mt-2 text-xs text-ink-muted">{t("counts", { available: count("AVAILABLE"), held: count("HELD"), sold: count("SOLD"), blocked: count("BLOCKED") })}</p>
        </div>
      ) : null}

      {!readOnly ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form {...cat.formProps} className="grid gap-3 rounded-md bg-surface-sunken p-4" noValidate>
            <p className="font-semibold">{t("addCategory")}</p>
            <FormError state={cat.state} />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input name="name" aria-label={t("categoryName")} placeholder={t("categoryName")} maxLength={40} />
              <input type="color" name="color" defaultValue={palette.rose} aria-label={t("categoryColor")} className="h-12 w-14 rounded-md" />
            </div>
            <Select name="ticketTypeId" aria-label={t("ticketType")} defaultValue="">
              <option value="">{t("ticketTypeNone")}</option>
              {ticketTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </Select>
            <SubmitButton pending={cat.pending} variant="secondary" className="w-full sm:w-auto sm:justify-self-start">
              {t("addCategory")}
            </SubmitButton>
          </form>
          {categories.length ? (
            <form {...row.formProps} className="grid gap-3 rounded-md bg-surface-sunken p-4" noValidate>
              <p className="font-semibold">{t("addRow")}</p>
              <FormError state={row.state} />
              <Select name="categoryId" aria-label={t("category")} defaultValue={categories[0]?.id}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <Input name="name" aria-label={t("rowName")} placeholder={t("rowName")} maxLength={20} />
                <Field label={t("seats")} htmlFor="seat-list" hint={t("seatsHint")}>
                  <Input id="seat-list" name="seats" placeholder="12" maxLength={800} />
                </Field>
              </div>
              <SubmitButton pending={row.pending} variant="secondary" className="w-full sm:w-auto sm:justify-self-start">
                {t("addRow")}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
