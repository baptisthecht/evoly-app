"use client";

import { useState, useTransition } from "react";
import { saveBotProtectionAction } from "@/app/o/[orgSlug]/events/actions";
import { Card } from "@/components/ui/Card";

/** RG-BUY-10 : interrupteur de la protection anti-robots, pour les ventes à forte demande. */
export function BotProtection({
  orgSlug,
  eventId,
  enabled,
  readOnly,
  labels,
}: {
  orgSlug: string;
  eventId: string;
  enabled: boolean;
  readOnly: boolean;
  labels: { title: string; hint: string; saved: string };
}) {
  const [on, setOn] = useState(enabled);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="mt-6">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-ink"
          checked={on}
          disabled={readOnly || pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            start(async () => {
              const r = await saveBotProtectionAction(orgSlug, eventId, next);
              if (r?.ok) setMsg(labels.saved);
              else setOn(!next);
            });
          }}
        />
        <span className="grid gap-1">
          <span className="font-semibold">{labels.title}</span>
          <span className="text-sm text-ink-muted">{labels.hint}</span>
          {msg ? (
            <span role="status" className="text-sm text-ink-muted">
              {msg}
            </span>
          ) : null}
        </span>
      </label>
    </Card>
  );
}
