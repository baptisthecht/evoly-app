"use client";

import { useState, useTransition } from "react";
import { toggleAutomationAction } from "@/actions/emailMarketing";

interface Automation {
  id: string;
  type: string;
  enabled: boolean;
  lastSentAt: string | null;
  content: object;
}

const AUTO_META: Record<string, { label: string; description: string; trigger: string; defaultEnabled: boolean }> = {
  REMINDER_J7: {
    label: "Rappel J-7",
    description: "Envoyé 7 jours avant l'événement à 10h.",
    trigger: "7 jours avant",
    defaultEnabled: true,
  },
  REMINDER_J1: {
    label: "Rappel J-1",
    description: "Envoyé la veille de l'événement à 10h.",
    trigger: "La veille",
    defaultEnabled: true,
  },
  REMINDER_J0: {
    label: "Rappel J-0",
    description: "Envoyé le matin de l'événement à 8h.",
    trigger: "Le jour J à 8h",
    defaultEnabled: true,
  },
  POST_EVENT: {
    label: "Post-événement",
    description: "Envoyé 2 heures après la fin de l'événement.",
    trigger: "2h après la fin",
    defaultEnabled: false,
  },
  LAST_TICKETS: {
    label: "Derniers billets",
    description: "Envoyé quand le stock global passe sous 10%.",
    trigger: "Stock < 10%",
    defaultEnabled: false,
  },
};

interface Props {
  automations: Automation[];
  organizationId: string;
  eventId: string;
  eventStatus: string;
}

export function AutomationsPanel({ automations, organizationId, eventId, eventStatus }: Props) {
  const [states, setStates] = useState<Record<string, boolean>>(
    Object.fromEntries(automations.map((a) => [a.id, a.enabled]))
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, value: boolean) {
    setStates((prev) => ({ ...prev, [id]: value }));
    startTransition(async () => {
      const result = await toggleAutomationAction(id, organizationId, value);
      if (result.error) {
        setStates((prev) => ({ ...prev, [id]: !value }));
        setError(result.error);
      }
    });
  }

  // Sort by logical order
  const order = ["REMINDER_J7", "REMINDER_J1", "REMINDER_J0", "POST_EVENT", "LAST_TICKETS"];
  const sorted = [...automations].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  if (automations.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500 text-sm">
          {eventStatus === "PUBLISHED"
            ? "Chargement des automatisations..."
            : "Publiez l'événement pour activer les automatisations."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <p className="text-sm text-gray-500">
        Les automatisations s&apos;envoient automatiquement aux acheteurs non remboursés. Disponibles en Free et Pro.
      </p>

      {sorted.map((auto) => {
        const meta = AUTO_META[auto.type];
        if (!meta) return null;
        const enabled = states[auto.id] ?? auto.enabled;

        return (
          <div
            key={auto.id}
            className={`bg-white rounded-2xl border p-5 transition-colors ${
              enabled ? "border-violet-200" : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {meta.trigger}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{meta.description}</p>
                {auto.lastSentAt && (
                  <p className="text-xs text-green-600">
                    ✓ Dernier envoi : {new Date(auto.lastSentAt).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>

              {/* Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => toggle(auto.id, !enabled)}
                disabled={isPending}
                className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                  enabled ? "bg-violet-600" : "bg-gray-200"
                } disabled:opacity-50`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
