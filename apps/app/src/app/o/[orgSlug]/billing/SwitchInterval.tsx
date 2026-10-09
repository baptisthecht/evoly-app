"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { switchIntervalAction } from "./actions";

/** RG-SUB-05 : passage du mensuel à l'annuel ou l'inverse, sans passer par le portail Stripe. */
export function SwitchInterval({
  orgSlug,
  target,
  label,
  done,
  error,
}: {
  orgSlug: string;
  target: "MONTH" | "YEAR";
  label: string;
  done: string;
  error: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => start(async () => setMsg((await switchIntervalAction(orgSlug, target))?.ok ? done : error))}
      >
        {label}
      </Button>
      {msg ? (
        <p role="status" className="text-sm text-ink-muted">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
