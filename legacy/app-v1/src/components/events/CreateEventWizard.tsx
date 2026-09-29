"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createEventAction } from "@/actions/events";

type Step = 1 | 2 | 3;
type LocationType = "PHYSICAL" | "ONLINE" | "HYBRID";

interface WizardProps {
  organizationId: string;
  orgSlug: string;
  orgTimezone: string;
  stripeConnected: boolean;
}

const TIMEZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
];

export function CreateEventWizard({ organizationId, orgSlug, orgTimezone, stripeConnected }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Step 1 state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [startsAtTime, setStartsAtTime] = useState("19:00");
  const [endsAt, setEndsAt] = useState("");
  const [endsAtTime, setEndsAtTime] = useState("22:00");
  const [timezone, setTimezone] = useState(orgTimezone);

  // Step 2 state
  const [locationType, setLocationType] = useState<LocationType>("PHYSICAL");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [streamUrl, setStreamUrl] = useState("");

  // Autosave indicator
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  function validateStep1(): boolean {
    const errs: Record<string, string[]> = {};
    if (!title.trim()) errs.title = ["Le titre est requis."];
    if (!startsAt) errs.startsAt = ["La date est requise."];
    if (!startsAtTime) errs.startsAtTime = ["L'heure est requise."];
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2(): boolean {
    const errs: Record<string, string[]> = {};
    if ((locationType === "PHYSICAL" || locationType === "HYBRID") && !locationName.trim()) {
      errs.locationName = ["Le nom du lieu est requis."];
    }
    if ((locationType === "ONLINE" || locationType === "HYBRID") && streamUrl && !isValidUrl(streamUrl)) {
      errs.streamUrl = ["URL invalide."];
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    setError(null);
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  }

  function handleSubmit(publish: boolean) {
    setError(null);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("startsAt", startsAt);
    formData.set("startsAtTime", startsAtTime);
    if (endsAt) formData.set("endsAt", endsAt);
    if (endsAtTime) formData.set("endsAtTime", endsAtTime);
    formData.set("timezone", timezone);
    formData.set("locationType", locationType);
    if (locationName) formData.set("locationName", locationName);
    if (locationAddress) formData.set("locationAddress", locationAddress);
    if (streamUrl) formData.set("streamUrl", streamUrl);

    startTransition(async () => {
      const result = await createEventAction(organizationId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.eventSlug) {
        router.push(`/dashboard/${orgSlug}/events/${result.eventSlug}${publish ? "?publish=1" : ""}`);
      }
    });
  }

  const fe = (field: string) => fieldErrors[field]?.[0];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => s < step && setStep(s as Step)}
              className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition-colors ${
                s === step
                  ? "bg-violet-600 text-white"
                  : s < step
                  ? "bg-violet-100 text-violet-600 cursor-pointer hover:bg-violet-200"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {s < step ? "✓" : s}
            </button>
            <span className={`text-sm ${s === step ? "font-medium text-gray-900" : "text-gray-400"}`}>
              {s === 1 ? "Infos" : s === 2 ? "Lieu" : "Récapitulatif"}
            </span>
            {s < 3 && <div className={`flex-1 h-px w-6 ${s < step ? "bg-violet-300" : "bg-gray-200"}`} />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-gray-900">Informations de base</h2>

            <Field label="Titre" required error={fe("title")}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Concert de jazz au Palais des Beaux-Arts"
                className={inputClass(!!fe("title"))}
                maxLength={200}
                autoFocus
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Décrivez votre événement..."
                className={`${inputClass(false)} min-h-[100px] resize-y`}
                rows={4}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Date de début" required error={fe("startsAt")}>
                <input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className={inputClass(!!fe("startsAt"))}
                />
              </Field>
              <Field label="Heure de début" required error={fe("startsAtTime")}>
                <input
                  type="time"
                  value={startsAtTime}
                  onChange={(e) => setStartsAtTime(e.target.value)}
                  className={inputClass(!!fe("startsAtTime"))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Date de fin">
                <input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  min={startsAt}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Heure de fin">
                <input
                  type="time"
                  value={endsAtTime}
                  onChange={(e) => setEndsAtTime(e.target.value)}
                  className={inputClass(false)}
                />
              </Field>
            </div>

            <Field label="Fuseau horaire">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={inputClass(false)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-gray-900">Lieu de l&apos;événement</h2>

            <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Type de lieu">
              {(["PHYSICAL", "ONLINE", "HYBRID"] as LocationType[]).map((type) => {
                const labels = { PHYSICAL: "Physique", ONLINE: "En ligne", HYBRID: "Hybride" };
                const icons = {
                  PHYSICAL: "📍",
                  ONLINE: "💻",
                  HYBRID: "🌐",
                };
                return (
                  <label
                    key={type}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      locationType === type
                        ? "border-violet-600 bg-violet-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      checked={locationType === type}
                      onChange={() => setLocationType(type)}
                    />
                    <span className="text-xl">{icons[type]}</span>
                    <span className="text-xs font-medium text-gray-700">{labels[type]}</span>
                  </label>
                );
              })}
            </div>

            {(locationType === "PHYSICAL" || locationType === "HYBRID") && (
              <>
                <Field label="Nom du lieu" required={locationType === "PHYSICAL"} error={fe("locationName")}>
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Palais des Beaux-Arts, Salle La Cigale..."
                    className={inputClass(!!fe("locationName"))}
                  />
                </Field>
                <Field label="Adresse">
                  <input
                    type="text"
                    value={locationAddress}
                    onChange={(e) => setLocationAddress(e.target.value)}
                    placeholder="23 Rue Royale, 1000 Bruxelles"
                    className={inputClass(false)}
                  />
                </Field>
              </>
            )}

            {(locationType === "ONLINE" || locationType === "HYBRID") && (
              <Field label="URL du stream" hint="Visible uniquement après achat" error={fe("streamUrl")}>
                <input
                  type="url"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                  className={inputClass(!!fe("streamUrl"))}
                />
              </Field>
            )}
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-gray-900">Récapitulatif</h2>

            <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
              <SummaryRow label="Titre" value={title} />
              <SummaryRow
                label="Date"
                value={`${startsAt ? formatDate(startsAt) : "—"} à ${startsAtTime}`}
              />
              {endsAt && <SummaryRow label="Fin" value={`${formatDate(endsAt)} à ${endsAtTime}`} />}
              <SummaryRow label="Fuseau" value={timezone} />
              <SummaryRow
                label="Lieu"
                value={
                  locationType === "PHYSICAL"
                    ? locationName || "À définir"
                    : locationType === "ONLINE"
                    ? "En ligne"
                    : `Hybride${locationName ? ` — ${locationName}` : ""}`
                }
              />
            </div>

            {!stripeConnected && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p>
                  <strong>Stripe non connecté.</strong> Vous pourrez uniquement créer des tickets gratuits. Connectez Stripe dans les paramètres pour les tickets payants.
                </p>
              </div>
            )}

            <p className="text-xs text-gray-400">
              Vous pourrez modifier tous les détails et ajouter des tickets après la création.
            </p>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => step > 1 ? setStep((step - 1) as Step) : router.back()}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          {step === 1 ? "Annuler" : "Retour"}
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={handleNext}
            className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Continuer
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={isPending}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isPending ? "Création..." : "Sauvegarder brouillon"}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Publier l&apos;événement
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function Field({
  label, required, error, hint, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors ${
    hasError ? "border-red-400 focus:border-red-400 focus:ring-red-400" : "border-gray-300 focus:border-violet-500"
  }`;
}

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
