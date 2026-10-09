"use client";

import { useId, useState, useTransition } from "react";
import { subscribeAlertAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { buttonClass } from "@/components/ui/Button";

export type AlertLabels = {
  title: string;
  intro: string;
  email: string;
  submit: string;
  consent: string;
  done: string;
  error: string;
  invalid: string;
  limited: string;
};

/** « Prévenez-moi » (RG-PRG-04) : un e-mail à l'ouverture des ventes, avec un accord explicite et limité à cet usage. */
export function AlertForm({ eventId, labels }: { eventId: string; labels: AlertLabels }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "done" | "error" | "invalid" | "limited">("idle");
  const [pending, start] = useTransition();
  if (state === "done")
    return (
      <p role="status" className="rounded-xl bg-info-soft px-4 py-3 text-sm">
        {labels.done}
      </p>
    );
  return (
    <form
      className="grid w-full max-w-md gap-2 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await subscribeAlertAction(eventId, email);
          setState(r.ok ? "done" : r.error === "INVALID_EMAIL" ? "invalid" : r.error === "RATE_LIMITED" ? "limited" : "error");
        });
      }}
    >
      <p className="font-semibold">{labels.title}</p>
      <p className="text-sm text-ink-muted">{labels.intro}</p>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={id}>
          {labels.email}
        </label>
        <input
          id={id}
          type="email"
          required
          autoComplete="email"
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={labels.email}
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-raised px-4 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink"
        />
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {labels.submit}
        </button>
      </div>
      <p className="text-xs text-ink-muted">{labels.consent}</p>
      {state !== "idle" ? (
        <p role="alert" className="text-sm text-danger">
          {state === "invalid" ? labels.invalid : state === "limited" ? labels.limited : labels.error}
        </p>
      ) : null}
    </form>
  );
}
