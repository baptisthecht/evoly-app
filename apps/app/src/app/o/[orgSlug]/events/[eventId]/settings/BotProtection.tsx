"use client";

import { useState, useTransition } from "react";
import { saveBotProtectionAction } from "@/app/o/[orgSlug]/events/actions";
import { SettingsRow, SwitchRow } from "@/components/ui/Controls";

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
  labels: {
    /** Titre et explication de la section (colonne de gauche). */
    section: string;
    description: string;
    title: string;
    hint: string;
    saved: string;
  };
}) {
  const [on, setOn] = useState(enabled);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // refonte A3 (maquette Réglages) : une section de plus sous les réglages de vente, un interrupteur
  return (
    <SettingsRow
      title={labels.section}
      description={labels.description}
      className="-mt-6 border-t border-b-0"
    >
      <SwitchRow
        label={labels.title}
        hint={
          <>
            {labels.hint}
            {msg ? (
              <span role="status" className="block">
                {msg}
              </span>
            ) : null}
          </>
        }
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
    </SettingsRow>
  );
}
