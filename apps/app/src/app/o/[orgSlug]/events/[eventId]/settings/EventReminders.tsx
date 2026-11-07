"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { SettingsRow, SwitchRow } from "@/components/ui/Controls";
import { reminderAction } from "@/app/o/[orgSlug]/events/actions";

type Reminder = {
  type: "REMINDER_J7" | "REMINDER_J1" | "REMINDER_J0";
  enabled: boolean;
  lastRunAt: string | null;
};

/** US-MKT-01 : rappels J-7, J-1 et jour J, activés par défaut (Pro). */
export function EventReminders({
  orgSlug,
  eventId,
  pro,
  reminders,
}: {
  orgSlug: string;
  eventId: string;
  pro: boolean;
  reminders: Reminder[];
}) {
  const t = useTranslations("reminders");
  const [state, setState] = useState(reminders);
  const [pending, start] = useTransition();
  // refonte A3 (maquette « Réglages de l'événement ») : une rangée, un interrupteur par rappel (« .swrow »)
  return (
    <SettingsRow
      title={t("title")}
      description={pro ? t("intro") : t("upsell")}
    >
      {pro
        ? state.map((r) => (
            <SwitchRow
              key={r.type}
              label={t(`type_${r.type}`)}
              hint={r.lastRunAt ? t("sent") : t(`when_${r.type}`)}
              checked={r.enabled}
              disabled={pending}
              onChange={(e) => {
                const enabled = e.target.checked;
                setState((s) =>
                  s.map((x) => (x.type === r.type ? { ...x, enabled } : x)),
                );
                start(async () => {
                  const res = await reminderAction(
                    orgSlug,
                    eventId,
                    r.type,
                    enabled,
                  );
                  // échec : retour à l'état réel, pour ne jamais afficher un rappel qui ne partira pas (comme la protection anti-robots)
                  if (!res?.ok)
                    setState((s) =>
                      s.map((x) =>
                        x.type === r.type ? { ...x, enabled: !enabled } : x,
                      ),
                    );
                });
              }}
            />
          ))
        : null}
    </SettingsRow>
  );
}
