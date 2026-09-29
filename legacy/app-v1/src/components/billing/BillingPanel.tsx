"use client";

import { useState, useTransition } from "react";
import { createProCheckoutAction, createBillingPortalAction } from "@/actions/billing";

interface Plan {
  id: string;
  name: string;
  monthlyFreeQuota: number;
  commissionRate: number;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
}

interface OrgData {
  id: string;
  slug: string;
  planId: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  ticketsSoldThisMonth: number;
  plan: Plan;
}

interface Invoice {
  id: string;
  date: number;
  amount: number;
  status: string;
  pdf: string | null;
}

interface Props {
  org: OrgData;
  invoices: Invoice[];
}

export function BillingPanel({ org, invoices }: Props) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPro = org.planId === "pro";
  const quotaUsed = org.ticketsSoldThisMonth;
  const quotaTotal = org.plan.monthlyFreeQuota;
  const quotaPct = Math.min(100, Math.round((quotaUsed / quotaTotal) * 100));

  const statusLabel: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Actif", cls: "bg-green-100 text-green-700" },
    TRIALING: { label: "Essai gratuit", cls: "bg-violet-100 text-violet-700" },
    PAST_DUE: { label: "Paiement en retard", cls: "bg-red-100 text-red-700" },
    CANCELED: { label: "Annulé", cls: "bg-gray-100 text-gray-500" },
    INACTIVE: { label: "Inactif", cls: "bg-gray-100 text-gray-500" },
  };

  const statusInfo = statusLabel[org.subscriptionStatus] ?? statusLabel.INACTIVE;

  function handleUpgrade() {
    startTransition(async () => {
      const result = await createProCheckoutAction(org.id, interval);
      if (result.error) { setError(result.error); return; }
      if (result.url) window.location.href = result.url;
    });
  }

  function handleManage() {
    startTransition(async () => {
      const result = await createBillingPortalAction(org.id);
      if (result.error) { setError(result.error); return; }
      if (result.url) window.location.href = result.url;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Abonnement</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gérez votre plan et vos factures.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Current plan */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">
              Plan {org.plan.name}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.cls}`}>
              {statusInfo.label}
            </span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {isPro
              ? `${(org.plan.monthlyPriceCents / 100).toFixed(0)}€/mois`
              : "Gratuit"}
          </span>
        </div>

        {org.trialEndsAt && org.subscriptionStatus === "TRIALING" && (
          <div className="bg-violet-50 rounded-xl p-3 text-sm text-violet-700">
            Essai gratuit jusqu&apos;au{" "}
            {new Date(org.trialEndsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        )}

        {org.subscriptionStatus === "PAST_DUE" && (
          <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700">
            ⚠️ Paiement en échec. Mettez à jour votre moyen de paiement pour éviter un retour au plan Free.
          </div>
        )}

        {org.subscriptionEndsAt && org.subscriptionStatus === "CANCELED" && (
          <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-700">
            Votre abonnement se termine le{" "}
            {new Date(org.subscriptionEndsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        )}

        {/* Quota */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tickets payants offerts ce mois</span>
            <span className="font-medium text-gray-900">{quotaUsed} / {quotaTotal}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${quotaPct >= 100 ? "bg-red-500" : quotaPct >= 80 ? "bg-amber-500" : "bg-violet-600"}`}
              style={{ width: `${quotaPct}%` }}
            />
          </div>
          {quotaPct >= 80 && (
            <p className="text-xs text-amber-600">
              {quotaPct >= 100
                ? `Quota atteint — commission ${(org.plan.commissionRate * 100).toFixed(0)}% sur les tickets suivants`
                : `Bientôt atteint — ${quotaTotal - quotaUsed} tickets restants`}
            </p>
          )}
        </div>

        <p className="text-xs text-gray-400">
          Commission : {org.plan.commissionRate * 100}% au-delà du quota · 0% sur les tickets gratuits
        </p>
      </div>

      {/* Upgrade / Manage */}
      {!isPro ? (
        <div className="bg-white rounded-2xl border-2 border-violet-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Passer au plan Pro</h2>
              <p className="text-sm text-gray-500">14 jours d&apos;essai gratuit, sans engagement</p>
            </div>
            <span className="text-xs bg-violet-600 text-white px-2 py-1 rounded-full font-medium">Populaire</span>
          </div>

          <ul className="space-y-1.5 text-sm text-gray-600">
            {[
              "150 tickets payants offerts/mois (vs 30)",
              "Commission 2.5% (vs 5%)",
              "Email marketing & automatisations",
              "Domaines custom",
              "Branding organisateur",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>

          {/* Interval toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
            {(["month", "year"] as const).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${interval === i ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {i === "month" ? `${(29).toFixed(0)}€/mois` : `${(249 / 12).toFixed(0)}€/mois · Annuel`}
              </button>
            ))}
          </div>
          {interval === "year" && (
            <p className="text-xs text-green-600 font-medium">✓ Économisez 15% avec le plan annuel (249€/an)</p>
          )}

          <button
            type="button"
            onClick={handleUpgrade}
            disabled={isPending}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors"
          >
            {isPending ? "Redirection..." : "Démarrer l'essai gratuit"}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Gérer l&apos;abonnement</p>
            <p className="text-xs text-gray-400">Modifier CB, annuler, voir les factures Stripe</p>
          </div>
          <button
            type="button"
            onClick={handleManage}
            disabled={isPending}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isPending ? "..." : "Gérer via Stripe →"}
          </button>
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Historique des factures</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-gray-900">
                    {new Date(inv.date * 1000).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                  </p>
                  <p className="text-xs text-gray-400">{(inv.amount / 100).toFixed(2)}€</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === "paid" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {inv.status === "paid" ? "Payée" : inv.status}
                  </span>
                  {inv.pdf && (
                    <a href={inv.pdf} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline">
                      PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
