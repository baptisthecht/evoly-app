"use client";

import { useState, useTransition } from "react";
import { createRefundRequestAction } from "@/actions/refunds";

interface Props {
  orderId: string;
  magicToken: string;
  canRefund: boolean;
  isOutOfDeadline: boolean;
  refundReason: string;
  tickets: { id: string; label: string }[];
  existingRequests: { status: string; count: number }[];
}

export function RefundRequestForm({
  orderId, magicToken, canRefund, isOutOfDeadline, refundReason, tickets, existingRequests,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleSubmit() {
    if (selected.length === 0) { setError("Sélectionnez au moins un billet."); return; }
    setError(null);
    startTransition(async () => {
      const r = await createRefundRequestAction(orderId, selected, reason || null, isOutOfDeadline);
      if (r.error) { setError(r.error); return; }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
        <p className="text-3xl">✅</p>
        <h2 className="font-semibold text-gray-900">Demande envoyée</h2>
        <p className="text-sm text-gray-500">
          L'organisateur examinera votre demande. Vous recevrez un email de réponse.
        </p>
        <a href={`/tickets/${magicToken}`}
          className="text-sm text-violet-600 hover:underline">Voir mes billets →</a>
      </div>
    );
  }

  // Existing pending requests
  if (existingRequests.some(r => r.status === "PENDING" || r.status === "APPROVED")) {
    return (
      <div className="bg-white rounded-2xl border border-amber-200 p-6 space-y-2">
        <p className="text-sm font-semibold text-amber-700">⏳ Demande en cours</p>
        <p className="text-sm text-gray-600">
          Vous avez déjà une demande de remboursement en attente pour cette commande.
        </p>
        <a href={`/tickets/${magicToken}`} className="text-sm text-violet-600 hover:underline">
          Voir mes billets →
        </a>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500">Aucun billet éligible au remboursement.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!canRefund && (
        <div className={`p-4 rounded-2xl border text-sm ${isOutOfDeadline ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
          <p className="font-medium mb-1">{isOutOfDeadline ? "⚠️ Hors délai" : "ℹ️ Non remboursable"}</p>
          <p>{refundReason}</p>
          {isOutOfDeadline && (
            <p className="mt-1 text-xs">Vous pouvez quand même soumettre une demande — l'organisateur aura le choix de l'accepter ou non.</p>
          )}
        </div>
      )}

      {(canRefund || isOutOfDeadline) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-3">
              Sélectionnez les billets à rembourser
            </p>
            <div className="space-y-2">
              {tickets.map(t => (
                <label key={t.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-xl hover:bg-gray-50">
                  <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)}
                    className="rounded text-violet-600 focus:ring-violet-500" />
                  <span className="text-sm text-gray-800">{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Motif (optionnel)
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Expliquez la raison de votre demande..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
            La commission Evoly et les frais Stripe ne sont pas remboursés (standard industrie).
          </div>

          <button onClick={handleSubmit} disabled={isPending || selected.length === 0}
            className="w-full py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl disabled:opacity-50 hover:bg-violet-700 transition-colors">
            {isPending ? "Envoi..." : `Demander le remboursement${selected.length > 0 ? ` (${selected.length} billet${selected.length > 1 ? "s" : ""})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
