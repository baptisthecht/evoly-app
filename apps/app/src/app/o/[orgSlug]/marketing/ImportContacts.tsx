"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { SavedNote } from "@/components/ui/Controls";
import { DialogFooter } from "@/components/ui/Dialog";
import { importContactsAction } from "./actions";

type Labels = {
  title: string;
  intro: string;
  file: string;
  consent: string;
  submit: string;
  done: (r: {
    created: number;
    updated: number;
    unsubscribed: number;
    invalid: number;
  }) => string;
  error: (code: string) => string;
};

/** Import de contacts depuis un fichier CSV (P1), consentement certifié. */
export function ImportContacts({
  orgSlug,
  labels,
}: {
  orgSlug: string;
  labels: Omit<Labels, "done" | "error"> & {
    doneTemplate: string;
    errors: Record<string, string>;
    fallbackError: string;
  };
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const formId = `${id}-form`;
  // dans la fenêtre « Importer des contacts » (refonte A3, maquette « Nouveau tarif ») : le titre est celui de la
  // fenêtre, le bouton va dans son pied
  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-ink-muted">{labels.intro}</p>
      <form
        id={formId}
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          start(async () => {
            const r = await importContactsAction(
              orgSlug,
              await file.text(),
              consent,
            );
            if (r?.ok)
              setMsg({
                ok: true,
                text: labels.doneTemplate.replace(
                  /\{(\w+)\}/g,
                  (_, k: string) =>
                    String((r.data as Record<string, number>)[k] ?? 0),
                ),
              });
            else
              setMsg({
                ok: false,
                text:
                  (r && !r.ok && labels.errors[r.error]) ||
                  labels.fallbackError,
              });
          });
        }}
      >
        <label className="grid gap-1.5" htmlFor={`${id}-f`}>
          <span className="text-[length:var(--label-size)] [font-weight:var(--label-weight)]">
            {labels.file}
          </span>
          {/* le sélecteur de fichier du navigateur, le bouton au dessin des boutons secondaires */}
          <input
            id={`${id}-f`}
            type="file"
            accept=".csv,text/csv,text/plain"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[13px] text-ink-muted file:mr-3 file:h-[34px] file:cursor-pointer file:rounded-[8px] file:border file:border-line-strong file:bg-surface-raised file:px-[13px] file:text-[13.5px] file:font-medium file:text-ink"
          />
        </label>
        <label className="flex items-start gap-2.5 text-[13.5px]">
          <input
            type="checkbox"
            className="mt-0.5"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>{labels.consent}</span>
        </label>
        {msg ? (
          msg.ok ? (
            <SavedNote id={`${id}-status`}>{msg.text}</SavedNote>
          ) : (
            <p role="status" className="text-[13px] text-danger">
              {msg.text}
            </p>
          )
        ) : null}
        <DialogFooter>
          <Button
            type="submit"
            form={formId}
            disabled={pending || !file || !consent}
          >
            {labels.submit}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
}
