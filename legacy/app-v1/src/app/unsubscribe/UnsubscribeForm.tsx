"use client";

import { useState, useTransition } from "react";
import { unsubscribeAction } from "@/actions/emailMarketing";

interface Props {
  email: string;
  orgId: string | null;
  eventId: string | null;
}

export function UnsubscribeForm({ email: initialEmail, orgId, eventId }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!email.includes("@")) { setError("Email invalide."); return; }
    startTransition(async () => {
      const result = await unsubscribeAction(email, orgId ?? undefined, eventId ?? undefined);
      if (result.error) { setError(result.error as string); return; }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="text-4xl">✅</div>
        <p className="text-sm font-medium text-gray-900">Désinscription confirmée</p>
        <p className="text-xs text-gray-500">
          Vous ne recevrez plus d&apos;emails marketing. Les emails transactionnels (confirmation d&apos;achat, etc.) continuent d&apos;être envoyés.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full text-left">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">Votre email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
      >
        {isPending ? "Traitement..." : "Se désinscrire"}
      </button>
      <p className="text-xs text-gray-400 text-center">
        Les emails de confirmation d&apos;achat et de remboursement ne sont pas affectés.
      </p>
    </div>
  );
}
