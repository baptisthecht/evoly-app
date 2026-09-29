"use client";

import { useState, useTransition } from "react";
import { createResaleLinkAction, cancelResaleLinkAction } from "@/actions/resale";

interface Props {
  ticketId: string;
  magicToken: string;
  originalPriceCents: number;
  eventStartsAt: string;
  // existing resale link if any
  existingResale?: {
    token: string;
    priceCents: number;
    status: string;
    expiresAt: string;
  } | null;
}

export function ResaleButton({
  ticketId,
  magicToken,
  originalPriceCents,
  eventStartsAt,
  existingResale,
}: Props) {
  const [open, setOpen] = useState(false);
  const [priceCents, setPriceCents] = useState(
    existingResale?.priceCents ?? originalPriceCents
  );
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const maxPrice = originalPriceCents * 2;
  const isFree = originalPriceCents === 0;
  const eventPassed = new Date() >= new Date(eventStartsAt);

  if (eventPassed) return null;

  function handleCreate() {
    startTransition(async () => {
      const res = await createResaleLinkAction({ ticketId, magicToken, priceCents });
      if ("error" in res) {
        setResult({ error: res.error });
      } else {
        setResult({ url: res.resaleUrl });
      }
    });
  }

  function handleCancel() {
    if (!existingResale) return;
    startTransition(async () => {
      await cancelResaleLinkAction(existingResale.token, magicToken);
      setResult({ error: "Lien annulé." });
      setOpen(false);
    });
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-amber-600 hover:text-amber-700 font-medium"
      >
        🔄 Revendre ce billet
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Revendre ce billet</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {existingResale && existingResale.status === "OPEN" && !result?.url ? (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-amber-800">Lien de revente actif</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Prix : {(existingResale.priceCents / 100).toFixed(2)}€
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/resale/${existingResale.token}`}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 font-mono truncate"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(`${typeof window !== "undefined" ? window.location.origin : ""}/resale/${existingResale.token}`)}
                      className="text-xs text-gray-500 hover:underline whitespace-nowrap"
                    >
                      Copier
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleCancel}
                  disabled={isPending}
                  className="w-full py-2 text-red-600 border border-red-200 rounded-xl text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Annuler le lien de revente
                </button>
              </div>
            ) : result?.url ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-green-800 mb-2">✅ Lien créé !</p>
                  <p className="text-xs text-green-700 mb-3">
                    Partagez ce lien à l&apos;acheteur. Il est valable jusqu&apos;à 2h avant l&apos;événement.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={result.url}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 font-mono truncate"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(result.url!)}
                      className="text-xs text-gray-500 hover:underline whitespace-nowrap"
                    >
                      Copier
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { setOpen(false); setResult(null); }}
                  className="w-full py-2 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200 transition-colors"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Fixez votre prix de revente. Maximum autorisé : 2x le prix original
                  {originalPriceCents > 0 ? ` (${(maxPrice / 100).toFixed(2)}€)` : " (billet gratuit)"}.
                </p>

                {!isFree && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prix de revente (€)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={maxPrice / 100}
                      step={0.5}
                      value={(priceCents / 100).toFixed(2)}
                      onChange={(e) => setPriceCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Prix original : {(originalPriceCents / 100).toFixed(2)}€ · Max : {(maxPrice / 100).toFixed(2)}€
                    </p>
                    <p className="text-xs text-gray-400">
                      Commission Evoly : {((priceCents * 0.05) / 100).toFixed(2)}€ (5%)
                    </p>
                  </div>
                )}

                {result?.error && (
                  <p className="text-red-600 text-sm">{result.error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={isPending || (!isFree && (priceCents < 0 || priceCents > maxPrice))}
                    className="flex-1 py-2.5 bg-gray-900 text-white font-semibold rounded-xl text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {isPending ? "Création…" : "Créer le lien"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
