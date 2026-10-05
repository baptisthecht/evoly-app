"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { reminderAction } from "@/app/o/[orgSlug]/events/actions";

type Reminder = { type: "REMINDER_J7" | "REMINDER_J1" | "REMINDER_J0"; enabled: boolean; lastRunAt: string | null };

/** US-MKT-01 : rappels J-7, J-1 et jour J, activés par défaut (Pro). */
export function EventReminders({ orgSlug, eventId, pro, reminders }: { orgSlug: string; eventId: string; pro: boolean; reminders: Reminder[] }) {
  const t = useTranslations("reminders");
  const [state, setState] = useState(reminders);
  const [pending, start] = useTransition();
  return (
    <Card className="mt-10 grid gap-3">
      <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("title")}</h2>
      <p className="-mt-1 text-sm text-ink-muted">{pro ? t("intro") : t("upsell")}</p>
      {pro ? (
        <ul className="grid gap-2">
          {state.map((r) => (
            <li key={r.type} className="flex items-center justify-between gap-3 border-t border-line pt-2">
              <div>
                <p className="font-semibold">{t(`type_${r.type}`)}</p>
                <p className="text-sm text-ink-muted">{r.lastRunAt ? t("sent") : t(`when_${r.type}`)}</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={r.enabled}
                  disabled={pending}
                  aria-label={t(`type_${r.type}`)}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setState((s) => s.map((x) => (x.type === r.type ? { ...x, enabled } : x)));
                    start(async () => {
                      await reminderAction(orgSlug, eventId, r.type, enabled);
                    });
                  }}
                />
                <span
                  className="h-7 w-12 rounded-full bg-line-strong transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-blanc after:transition-transform peer-checked:bg-surface-inverse peer-checked:after:translate-x-5 peer-focus-visible:outline-2"
                  aria-hidden="true"
                />
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
