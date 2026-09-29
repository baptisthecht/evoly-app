"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { onboardingStep2Action } from "@/actions/auth";

const ORG_TYPES = [
  {
    id: "INDIVIDUAL",
    label: "Particulier",
    description: "Organisateur indépendant, créateur, freelance",
    icon: "👤",
  },
  {
    id: "ASSOCIATION",
    label: "Association",
    description: "Association loi 1901, collectif, ONG",
    icon: "🤝",
  },
  {
    id: "COMPANY",
    label: "Entreprise",
    description: "PME, startup, agence événementielle",
    icon: "🏢",
  },
] as const;

export function OnboardingStep2Form() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) {
      setError("Veuillez sélectionner un type.");
      return;
    }
    setError(null);

    const orgId = sessionStorage.getItem("onboarding_org_id");
    if (!orgId) {
      router.push("/onboarding/profile");
      return;
    }

    const formData = new FormData();
    formData.set("orgType", selected);

    startTransition(async () => {
      const result = await onboardingStep2Action(orgId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/onboarding/stripe-connect");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="space-y-3" role="radiogroup" aria-label="Type d'organisation">
        {ORG_TYPES.map((type) => (
          <label
            key={type.id}
            className={`
              flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all
              ${selected === type.id
                ? "border-violet-600 bg-violet-50"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }
            `}
          >
            <input
              type="radio"
              name="orgType"
              value={type.id}
              className="sr-only"
              checked={selected === type.id}
              onChange={() => setSelected(type.id)}
            />
            <span className="text-2xl leading-none mt-0.5" aria-hidden="true">{type.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{type.label}</span>
                {selected === type.id && (
                  <span className="w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <circle cx="6" cy="6" r="3" />
                    </svg>
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{type.description}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push("/onboarding/profile")}
          className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Retour
        </button>
        <button
          type="submit"
          disabled={isPending || !selected}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isPending && (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Continuer
        </button>
      </div>
    </form>
  );
}
