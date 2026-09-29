"use client";

import { useState } from "react";

interface ReferralEntry {
  id: string;
  status: string;
  rewardGrantedAt: string | null;
  referredOrgName: string | null;
  createdAt: string;
}

interface Props {
  organizationId: string;
  orgSlug: string;
  referralCode: string;
  referralUrl: string;
  referrals: ReferralEntry[];
}

const statusLabels: Record<string, { label: string; color: string }> = {
  PENDING: { label: "En attente", color: "bg-gray-100 text-gray-600" },
  REGISTERED: { label: "Inscrit", color: "bg-blue-100 text-blue-700" },
  REWARDED: { label: "Récompensé ✓", color: "bg-green-100 text-green-700" },
};

export function ReferralDashboard({
  referralCode,
  referralUrl,
  referrals,
}: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const rewarded = referrals.filter((r) => r.status === "REWARDED").length;
  const registered = referrals.filter((r) => r.status === "REGISTERED").length;
  const pending = referrals.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Parrainage</h1>
        <p className="text-gray-500 text-sm">
          Parrainez d&apos;autres organisateurs et gagnez 1 mois Pro offert dès leur première vente payante.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5">
        <h2 className="font-semibold text-violet-900 mb-3">Comment ça marche ?</h2>
        <div className="space-y-2 text-sm text-violet-800">
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
            <p>Partagez votre lien de parrainage à un collègue ou une association.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
            <p>Il crée son compte Evoly via votre lien.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
            <p>Dès sa <strong>première vente payante</strong>, vous recevez <strong>1 mois Pro offert</strong> automatiquement.</p>
          </div>
        </div>
      </div>

      {/* Referral link */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Votre lien de parrainage</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={referralUrl}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono truncate"
          />
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              copied
                ? "bg-green-100 text-green-700"
                : "bg-violet-600 text-white hover:bg-violet-700"
            }`}
          >
            {copied ? "✓ Copié" : "Copier"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Code : <span className="font-mono font-medium">{referralCode}</span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{rewarded}</p>
          <p className="text-xs text-gray-500 mt-1">Récompenses obtenues</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{registered}</p>
          <p className="text-xs text-gray-500 mt-1">Filleuls inscrits</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{referrals.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total partages</p>
        </div>
      </div>

      {/* History */}
      {referrals.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Historique</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {referrals.map((r) => {
              const s = statusLabels[r.status] ?? { label: r.status, color: "bg-gray-100 text-gray-600" };
              return (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {r.referredOrgName ?? "En attente d'inscription"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                      {r.rewardGrantedAt && (
                        <> · Récompensé le {new Date(r.rewardGrantedAt).toLocaleDateString("fr-FR")}</>
                      )}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
