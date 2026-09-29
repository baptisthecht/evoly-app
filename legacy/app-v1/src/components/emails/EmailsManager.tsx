"use client";

import { useState } from "react";
import { AutomationsPanel } from "./AutomationsPanel";
import { CampaignsPanel } from "./CampaignsPanel";

interface Automation {
  id: string;
  type: string;
  enabled: boolean;
  lastSentAt: string | null;
  content: object;
}

interface Campaign {
  id: string;
  subject: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number | null;
  openCount: number;
  clickCount: number;
  unsubscribeCount: number;
}

interface Props {
  org: { id: string; planId: string; slug: string };
  event: { id: string; title: string; slug: string; status: string };
  isPro: boolean;
  automations: Automation[];
  campaigns: Campaign[];
  buyerCount: number;
}

export function EmailsManager({ org, event, isPro, automations, campaigns, buyerCount }: Props) {
  const [tab, setTab] = useState<"automations" | "campaigns">("automations");

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Emails</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {buyerCount} acheteur{buyerCount !== 1 ? "s" : ""} · {event.title}
          </p>
        </div>
        {!isPro && (
          <span className="text-xs bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full font-medium">
            Campagnes → Plan Pro
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 w-fit">
        {(["automations", "campaigns"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "automations" ? "Automatisations" : "Campagnes"}
          </button>
        ))}
      </div>

      {tab === "automations" && (
        <AutomationsPanel
          automations={automations}
          organizationId={org.id}
          eventId={event.id}
          eventStatus={event.status}
        />
      )}
      {tab === "campaigns" && (
        <CampaignsPanel
          campaigns={campaigns}
          organizationId={org.id}
          eventId={event.id}
          isPro={isPro}
          buyerCount={buyerCount}
          orgSlug={org.slug}
        />
      )}
    </div>
  );
}
