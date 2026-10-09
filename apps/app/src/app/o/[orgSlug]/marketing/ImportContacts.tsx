"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { importContactsAction } from "./actions";

type Labels = {
  title: string;
  intro: string;
  file: string;
  consent: string;
  submit: string;
  done: (r: { created: number; updated: number; unsubscribed: number; invalid: number }) => string;
  error: (code: string) => string;
};

/** Import de contacts depuis un fichier CSV (P1), consentement certifié. */
export function ImportContacts({
  orgSlug,
  labels,
}: {
  orgSlug: string;
  labels: Omit<Labels, "done" | "error"> & { doneTemplate: string; errors: Record<string, string>; fallbackError: string };
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="grid gap-3">
      <h2 className="font-display text-lg">{labels.title}</h2>
      <p className="text-sm text-ink-muted">{labels.intro}</p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          start(async () => {
            const r = await importContactsAction(orgSlug, await file.text(), consent);
            if (r?.ok)
              setMsg({ ok: true, text: labels.doneTemplate.replace(/\{(\w+)\}/g, (_, k: string) => String((r.data as Record<string, number>)[k] ?? 0)) });
            else setMsg({ ok: false, text: (r && !r.ok && labels.errors[r.error]) || labels.fallbackError });
          });
        }}
      >
        <label className="grid gap-1 text-sm" htmlFor={`${id}-f`}>
          <span className="font-medium">{labels.file}</span>
          <input id={`${id}-f`} type="file" accept=".csv,text/csv,text/plain" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-ink" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{labels.consent}</span>
        </label>
        <div>
          <Button type="submit" disabled={pending || !file || !consent}>
            {labels.submit}
          </Button>
        </div>
        {msg ? (
          <p role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>
            {msg.text}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
