"use client";

import { useState, useTransition } from "react";
import type { ScannerLink } from "@evoly/db";
import { createScannerLinkAction, revokeScannerLinkAction } from "@/actions/scanner";

interface Props {
  eventId: string;
  organizationId: string;
  scannerLinks: ScannerLink[];
  canManage: boolean;
}

const DURATION_OPTIONS = [
  { label: "Jour J uniquement", hours: 24 },
  { label: "48 heures", hours: 48 },
  { label: "7 jours", hours: 168 },
];

export function ScannerLinksManager({ eventId, organizationId, scannerLinks: initial, canManage }: Props) {
  const [links, setLinks] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(24);

  function handleCreate() {
    if (!label.trim()) return;
    startTransition(async () => {
      const result = await createScannerLinkAction(eventId, organizationId, label, hours);
      if (result.success && result.link) {
        setLinks((prev) => [result.link!, ...prev]);
        setLabel("");
        setCreating(false);
      }
    });
  }

  function handleRevoke(linkId: string) {
    startTransition(async () => {
      await revokeScannerLinkAction(linkId, organizationId);
      setLinks((prev) => prev.map((l) => l.id === linkId ? { ...l, revokedAt: new Date() } : l));
    });
  }

  const scannerBaseUrl = typeof window !== "undefined"
    ? window.location.origin.replace("3001", "3002")
    : "http://localhost:3002";

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Liens bénévoles</h3>
          <p className="text-xs text-gray-400">Accès scanner sans compte Evoly</p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreating(!creating)}
            className="text-xs font-medium text-violet-600 hover:underline"
          >
            + Créer un lien
          </button>
        )}
      </div>

      {creating && (
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nom du bénévole</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Marie Dupont"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Durée</label>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.hours} value={opt.hours}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCreating(false)} className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100">
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={isPending || !label.trim()}
              className="flex-1 px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              Générer le lien
            </button>
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400">Aucun lien créé.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {links.map((link) => {
            const isExpired = new Date(link.expiresAt) < new Date();
            const isRevoked = !!link.revokedAt;
            const scannerUrl = `${scannerBaseUrl}/scan/${link.token}`;

            return (
              <li key={link.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{link.label}</p>
                      {isRevoked && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">Révoqué</span>
                      )}
                      {!isRevoked && isExpired && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">Expiré</span>
                      )}
                      {!isRevoked && !isExpired && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">Actif</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      Expire le {new Date(link.expiresAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!isRevoked && !isExpired && (
                      <>
                        <button
                          onClick={() => navigator.clipboard.writeText(scannerUrl)}
                          className="text-xs text-violet-600 hover:underline"
                        >
                          Copier
                        </button>
                        {canManage && (
                          <button
                            onClick={() => handleRevoke(link.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Révoquer
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
