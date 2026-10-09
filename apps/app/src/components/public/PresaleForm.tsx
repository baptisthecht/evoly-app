"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { unlockPresaleAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { buttonClass } from "@/components/ui/Button";

type Labels = { ask: string; code: string; submit: string; invalid: string; limited: string };

/** Prévente privée (RG-PRV-02) : saisie d'un code, qui ouvre l'achat avant l'ouverture publique. */
export function PresaleForm({ eventId, labels }: { eventId: string; labels: Labels }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" className="text-sm underline underline-offset-4" onClick={() => setOpen(true)}>
        {labels.ask}
      </button>
    );
  return (
    <form
      className="flex w-full max-w-md flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await unlockPresaleAction(eventId, code);
          if (r.ok) router.refresh();
          else setError(r.error === "RATE_LIMITED" ? labels.limited : labels.invalid);
        });
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {labels.code}
      </label>
      <input
        id={id}
        required
        maxLength={40}
        autoCapitalize="characters"
        autoComplete="off"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={labels.code}
        className="h-11 min-w-0 flex-1 rounded-full bg-surface-raised px-4 text-sm uppercase ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink"
      />
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        {labels.submit}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
