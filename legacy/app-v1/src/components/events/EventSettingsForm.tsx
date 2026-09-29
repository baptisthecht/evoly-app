"use client";

import { useState, useTransition } from "react";
import { updateEventSettingsAction, cancelEventAction } from "@/actions/events";
import { useRouter } from "next/navigation";

interface EventData {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  refundPolicy: string;
  refundDeadlineDays: number | null;
  visibility: string;
  confirmationMessage: string;
  status: string;
}

interface Props {
  event: EventData;
  organizationId: string;
  orgSlug: string;
  eventSlug: string;
  canEdit: boolean;
}

const TIMEZONES = ["Europe/Paris", "Europe/Brussels", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Tokyo"];

export function EventSettingsForm({ event, organizationId, orgSlug, eventSlug, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelConfirmText, setCancelConfirmText] = useState("");

  // Parse initial dates
  const startDate = new Date(event.startsAt);
  const endDate = event.endsAt ? new Date(event.endsAt) : null;

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [startsAt, setStartsAt] = useState(fmt(startDate));
  const [startsAtTime, setStartsAtTime] = useState(fmtTime(startDate));
  const [endsAt, setEndsAt] = useState(endDate ? fmt(endDate) : "");
  const [endsAtTime, setEndsAtTime] = useState(endDate ? fmtTime(endDate) : "");
  const [timezone, setTimezone] = useState(event.timezone);
  const [refundPolicy, setRefundPolicy] = useState(event.refundPolicy);
  const [refundDeadlineDays, setRefundDeadlineDays] = useState(event.refundDeadlineDays?.toString() ?? "");
  const [visibility, setVisibility] = useState(event.visibility);
  const [confirmationMessage, setConfirmationMessage] = useState(event.confirmationMessage);

  function handleSave() {
    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("startsAt", startsAt);
    formData.set("startsAtTime", startsAtTime);
    if (endsAt) { formData.set("endsAt", endsAt); formData.set("endsAtTime", endsAtTime); }
    formData.set("timezone", timezone);
    formData.set("refundPolicy", refundPolicy);
    if (refundPolicy === "ORGANIZER_DEFINED" && refundDeadlineDays) {
      formData.set("refundDeadlineDays", refundDeadlineDays);
    }
    formData.set("visibility", visibility);
    formData.set("confirmationMessage", confirmationMessage);

    startTransition(async () => {
      const result = await updateEventSettingsAction(event.id, organizationId, formData);
      if (result.error) { setError(result.error); return; }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    });
  }

  function handleCancel() {
    if (cancelConfirmText !== event.title) return;
    startTransition(async () => {
      const result = await cancelEventAction(event.id, organizationId);
      if (result.error) { setError(result.error); return; }
      router.push(`/dashboard/${orgSlug}/events`);
    });
  }

  const isCancelled = event.status === "CANCELLED";
  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-gray-50 disabled:text-gray-400";

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          ✓ Paramètres sauvegardés.
        </div>
      )}

      {/* Infos générales */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 pb-2 border-b border-gray-100">Informations</h2>

        <Field label="Titre" required>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit || isCancelled} className={inputCls} />
        </Field>

        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit || isCancelled} className={`${inputCls} min-h-[100px] resize-y`} rows={4} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date de début" required>
            <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={!canEdit || isCancelled} className={inputCls} />
          </Field>
          <Field label="Heure">
            <input type="time" value={startsAtTime} onChange={(e) => setStartsAtTime(e.target.value)} disabled={!canEdit || isCancelled} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date de fin">
            <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={startsAt} disabled={!canEdit || isCancelled} className={inputCls} />
          </Field>
          <Field label="Heure de fin">
            <input type="time" value={endsAtTime} onChange={(e) => setEndsAtTime(e.target.value)} disabled={!canEdit || isCancelled} className={inputCls} />
          </Field>
        </div>

        <Field label="Fuseau horaire">
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canEdit || isCancelled} className={inputCls}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
      </section>

      {/* Visibilité */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 pb-2 border-b border-gray-100">Visibilité</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "PUBLIC", label: "Public", desc: "Visible sur le moteur de recherche" },
            { value: "UNLISTED", label: "Non listé", desc: "Accessible uniquement via le lien" },
          ].map((opt) => (
            <label key={opt.value} className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${visibility === opt.value ? "border-violet-600 bg-violet-50" : "border-gray-200 hover:border-gray-300"} ${!canEdit || isCancelled ? "opacity-50 cursor-not-allowed" : ""}`}>
              <input type="radio" className="sr-only" checked={visibility === opt.value} onChange={() => canEdit && setVisibility(opt.value)} />
              <p className="text-sm font-medium text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-400">{opt.desc}</p>
            </label>
          ))}
        </div>
      </section>

      {/* Remboursements */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 pb-2 border-b border-gray-100">Politique de remboursement</h2>
        <div className="space-y-2">
          {[
            { value: "NON_REFUNDABLE", label: "Non remboursable" },
            { value: "ORGANIZER_DEFINED", label: "Remboursable jusqu'à X jours avant" },
            { value: "ALWAYS_REFUNDABLE", label: "Toujours remboursable" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                checked={refundPolicy === opt.value}
                onChange={() => canEdit && setRefundPolicy(opt.value)}
                className="text-violet-600 focus:ring-violet-500"
                disabled={!canEdit || isCancelled}
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>

        {refundPolicy === "ORGANIZER_DEFINED" && (
          <Field label="Nombre de jours avant l'événement">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={refundDeadlineDays}
                onChange={(e) => setRefundDeadlineDays(e.target.value)}
                min="1"
                disabled={!canEdit || isCancelled}
                className={`${inputCls} w-24`}
                placeholder="7"
              />
              <span className="text-sm text-gray-500">jours</span>
            </div>
          </Field>
        )}
      </section>

      {/* Confirmation message */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 pb-2 border-b border-gray-100">Message de confirmation</h2>
        <Field label="Message post-achat" hint="Affiché après le paiement et dans l'email de confirmation">
          <textarea
            value={confirmationMessage}
            onChange={(e) => setConfirmationMessage(e.target.value)}
            disabled={!canEdit || isCancelled}
            className={`${inputCls} min-h-[80px] resize-y`}
            rows={3}
            placeholder="Merci pour votre achat ! Rendez-vous au..."
          />
        </Field>
      </section>

      {/* Save button */}
      {canEdit && !isCancelled && (
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {isPending ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>
      )}

      {/* Danger zone */}
      {canEdit && !isCancelled && (
        <section className="space-y-4 border border-red-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-red-700">Zone dangereuse</h2>
          <p className="text-sm text-gray-500">
            L&apos;annulation de l&apos;événement est irréversible. Les acheteurs seront remboursés automatiquement.
          </p>

          {!showCancelConfirm ? (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="px-4 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Annuler l&apos;événement
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Saisissez le titre de l&apos;événement pour confirmer :{" "}
                <span className="font-mono text-red-700">{event.title}</span>
              </p>
              <input
                type="text"
                value={cancelConfirmText}
                onChange={(e) => setCancelConfirmText(e.target.value)}
                placeholder={event.title}
                className={`${inputCls} border-red-300 focus:ring-red-400`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCancelConfirm(false); setCancelConfirmText(""); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelConfirmText !== event.title || isPending}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
                >
                  Confirmer l&apos;annulation
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
