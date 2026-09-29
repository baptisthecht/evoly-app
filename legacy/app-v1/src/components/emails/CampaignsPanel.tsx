"use client";

import { useState, useTransition } from "react";
import {
  createCampaignAction,
  updateCampaignAction,
  sendCampaignNowAction,
  cancelCampaignAction,
} from "@/actions/emailMarketing";
import { EmailEditor } from "./EmailEditor";

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
  campaigns: Campaign[];
  organizationId: string;
  eventId: string;
  isPro: boolean;
  buyerCount: number;
  orgSlug: string;
}

export function CampaignsPanel({ campaigns: initialCampaigns, organizationId, eventId, isPro, buyerCount, orgSlug }: Props) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState<object>({ blocks: [] });
  const [segment, setSegment] = useState("all");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  function openCreate() {
    setSubject(""); setContent({ blocks: [] }); setSegment("all");
    setScheduleDate(""); setScheduleTime(""); setEditingId(null);
    setView("create");
  }

  function openEdit(c: Campaign) {
    setSubject(c.subject); setEditingId(c.id);
    if (c.scheduledAt) {
      const d = new Date(c.scheduledAt);
      setScheduleDate(d.toISOString().split("T")[0]);
      setScheduleTime(d.toISOString().split("T")[1].slice(0, 5));
    } else {
      setScheduleDate(""); setScheduleTime("");
    }
    setView("edit");
  }

  function getScheduledAt() {
    if (!scheduleDate || !scheduleTime) return null;
    return new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
  }

  function handleSave() {
    setError(null);
    const data = { subject, content, segment: { type: segment }, scheduledAt: getScheduledAt() };
    startTransition(async () => {
      const result = view === "create"
        ? await createCampaignAction(eventId, organizationId, data)
        : await updateCampaignAction(editingId!, organizationId, data);

      if (result.error) { setError(result.error); return; }
      setSuccess("Campagne sauvegardée.");
      setView("list");
      setTimeout(() => window.location.reload(), 800);
    });
  }

  function handleSendNow(campaignId: string) {
    if (!confirm("Envoyer cette campagne maintenant ?")) return;
    startTransition(async () => {
      const result = await sendCampaignNowAction(campaignId, organizationId);
      if (result.error) { setError(result.error); return; }
      setSuccess(`Envoi en cours à ${result.recipientCount} destinataire${result.recipientCount !== 1 ? "s" : ""}.`);
      setTimeout(() => window.location.reload(), 1000);
    });
  }

  function handleCancel(campaignId: string) {
    if (!confirm("Annuler cette campagne ?")) return;
    startTransition(async () => {
      const result = await cancelCampaignAction(campaignId, organizationId);
      if (result.error) { setError(result.error); return; }
      setSuccess("Campagne annulée.");
      setTimeout(() => window.location.reload(), 800);
    });
  }

  if (!isPro) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center space-y-3">
        <p className="text-2xl">📧</p>
        <p className="text-base font-semibold text-gray-900">Email marketing</p>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Créez et envoyez des campagnes email à vos acheteurs. Segmentation, programmation et stats inclus.
        </p>
        <a
          href={`/dashboard/${orgSlug}/billing`}
          className="inline-block mt-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Passer au plan Pro
        </a>
      </div>
    );
  }

  if (view === "create" || view === "edit") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setView("list")}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-base font-semibold text-gray-900">
            {view === "create" ? "Nouvelle campagne" : "Modifier la campagne"}
          </h3>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {/* Subject */}
          <div className="p-5 space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">Objet *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Rappel — votre billet pour demain"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Segment */}
          <div className="p-5 space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">Destinataires</label>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">Tous les acheteurs ({buyerCount})</option>
              <option value="checked_in">Présents (check-in effectué)</option>
              <option value="not_checked_in">Absents (pas de check-in)</option>
            </select>
          </div>

          {/* Content editor */}
          <div className="p-5 space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">Contenu</label>
            <EmailEditor value={content} onChange={setContent} />
          </div>

          {/* Schedule */}
          <div className="p-5 space-y-2">
            <label className="block text-xs font-medium text-gray-600">Programmation (optionnel)</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {scheduleDate && scheduleTime && (
              <p className="text-xs text-gray-400">
                Envoi programmé le {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString("fr-FR", {
                  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setView("list")}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-xl hover:bg-gray-50">
            Annuler
          </button>
          <button type="button" onClick={handleSave} disabled={isPending || !subject.trim()}
            className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {isPending ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </div>
    );
  }

  // List view
  const statusMeta: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: "Brouillon", cls: "bg-gray-100 text-gray-600" },
    SCHEDULED: { label: "Programmée", cls: "bg-blue-100 text-blue-700" },
    SENDING: { label: "Envoi en cours", cls: "bg-amber-100 text-amber-700" },
    SENT: { label: "Envoyée", cls: "bg-green-100 text-green-700" },
    CANCELLED: { label: "Annulée", cls: "bg-red-100 text-red-600" },
  };

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">✓ {success}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{campaigns.length} campagne{campaigns.length !== 1 ? "s" : ""}</p>
        <button type="button" onClick={openCreate}
          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors">
          + Nouvelle campagne
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center space-y-2">
          <p className="text-2xl">✉️</p>
          <p className="text-sm text-gray-500">Aucune campagne pour l&apos;instant.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {campaigns.map((c) => {
            const s = statusMeta[c.status] ?? { label: c.status, cls: "bg-gray-100 text-gray-500" };
            const canEdit = c.status === "DRAFT" || c.status === "SCHEDULED";
            const canSend = c.status === "DRAFT";
            const canCancel = c.status === "SCHEDULED";

            return (
              <div key={c.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.subject}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
                      {c.scheduledAt && c.status === "SCHEDULED" && (
                        <span className="text-xs text-gray-400">
                          {new Date(c.scheduledAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {c.sentAt && (
                        <span className="text-xs text-gray-400">
                          {new Date(c.sentAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats for sent campaigns */}
                {c.status === "SENT" && c.recipientCount !== null && (
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>{c.recipientCount} envoyés</span>
                    {c.openCount > 0 && (
                      <span className="text-green-600">
                        {Math.round((c.openCount / c.recipientCount) * 100)}% ouvertures
                      </span>
                    )}
                    {c.clickCount > 0 && (
                      <span className="text-blue-600">
                        {Math.round((c.clickCount / c.recipientCount) * 100)}% clics
                      </span>
                    )}
                    {c.unsubscribeCount > 0 && (
                      <span className="text-red-500">{c.unsubscribeCount} désinscrits</span>
                    )}
                  </div>
                )}

                {/* Actions */}
                {(canEdit || canSend || canCancel) && (
                  <div className="flex gap-2 pt-1">
                    {canEdit && (
                      <button type="button" onClick={() => openEdit(c)}
                        className="px-3 py-1 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                        Modifier
                      </button>
                    )}
                    {canSend && (
                      <button type="button" onClick={() => handleSendNow(c.id)} disabled={isPending}
                        className="px-3 py-1 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                        Envoyer maintenant
                      </button>
                    )}
                    {canCancel && (
                      <button type="button" onClick={() => handleCancel(c.id)} disabled={isPending}
                        className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                        Annuler
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
