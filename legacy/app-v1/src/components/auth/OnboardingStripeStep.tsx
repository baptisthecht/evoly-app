"use client";

import { useState, useTransition } from "react";
import { createStripeConnectLinkAction } from "@/actions/stripeConnect";
import { useRouter } from "next/navigation";

interface Props {
  organizationId: string;
  orgSlug: string;
  stripeStatus: string;
}

export function OnboardingStripeStep({ organizationId, orgSlug, stripeStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const r = await createStripeConnectLinkAction(organizationId);
      if (r.error) { setError(r.error); return; }
      if (r.url) window.location.href = r.url;
    });
  }

  function handleSkip() {
    router.push(`/dashboard/${orgSlug}`);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Connectez votre compte bancaire</h2>
        <p className="text-sm text-gray-500 mt-1">
          Nécessaire uniquement pour les tickets payants. Vous pouvez le faire plus tard.
        </p>
      </div>

      {stripeStatus === "PENDING" && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
          <p className="font-medium">⏳ Vérification en cours</p>
          <p className="mt-1">Stripe examine votre compte. Cela peut prendre quelques minutes.</p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Benefits */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Avec Stripe Connect vous bénéficiez de :</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          {[
            "Paiements par carte, Apple Pay et Google Pay",
            "Virements directs sur votre compte bancaire",
            "Tableau de bord Stripe dédié",
            "Protection contre la fraude intégrée",
            "Commission prélevée automatiquement à la source",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-violet-600 flex-shrink-0">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Info box */}
      <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
        <p>Vos fonds arrivent directement sur votre compte bancaire. Evoly prélève sa commission automatiquement.</p>
      </div>

      <div className="space-y-2">
        <button
          onClick={handleConnect}
          disabled={isPending}
          className="w-full py-3 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {isPending ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Redirection Stripe...</>
          ) : (
            <><span>🏦</span> Connecter mon compte bancaire</>
          )}
        </button>

        <button
          onClick={handleSkip}
          className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Passer cette étape → accéder au dashboard
        </button>
      </div>

      <p className="text-center text-xs text-gray-400">
        Vous pourrez connecter votre compte bancaire plus tard depuis les paramètres.
      </p>
    </div>
  );
}
