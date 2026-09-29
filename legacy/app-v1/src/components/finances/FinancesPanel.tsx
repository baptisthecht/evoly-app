"use client";

import { useState, useTransition } from "react";
import { requestPayoutAction, approveRefundAction, rejectRefundAction } from "@/actions/finances";
import { createStripeConnectLinkAction, getStripeExpressDashboardLinkAction } from "@/actions/stripeConnect";

interface OrgData {
  id: string;
  slug: string;
  availableBalanceCents: number;
  reservedBalanceCents: number;
  stripeAccountStatus: string;
  stripeAccountId: string | null;
}

interface Payout {
  id: string;
  amountCents: number;
  status: string;
  requestedAt: string;
  paidAt: string | null;
  failureReason: string | null;
}

interface PendingRefund {
  id: string;
  orderId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  amountCents: number;
  reason: string | null;
  isOutOfDeadline: boolean;
  createdAt: string;
}

interface Reserve {
  id: string;
  amountCents: number;
  releasesAt: string;
}

interface Props {
  org: OrgData;
  payouts: Payout[];
  pendingRefunds: PendingRefund[];
  nextReleases: Reserve[];
  canManage: boolean;
}

export function FinancesPanel({ org, payouts, pendingRefunds, nextReleases, canManage }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState(
    (org.availableBalanceCents / 100).toFixed(2)
  );
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectMessage, setRejectMessage] = useState("");

  const stripeConnected = org.stripeAccountStatus === "ACTIVE";

  function handleConnectStripe() {
    startTransition(async () => {
      const result = await createStripeConnectLinkAction(org.id);
      if (result.error) { setError(result.error); return; }
      if (result.url) window.location.href = result.url;
    });
  }

  function handleStripeDashboard() {
    startTransition(async () => {
      const result = await getStripeExpressDashboardLinkAction(org.id);
      if (result.error) { setError(result.error); return; }
      if (result.url) window.open(result.url, "_blank");
    });
  }

  function handlePayout() {
    const cents = Math.round(parseFloat(payoutAmount) * 100);
    startTransition(async () => {
      const result = await requestPayoutAction(org.id, cents);
      if (result.error) { setError(result.error); return; }
      setSuccess("Virement demandé. Il sera traité sous 1-2 jours ouvrés.");
      setShowPayoutForm(false);
      setTimeout(() => window.location.reload(), 1500);
    });
  }

  function handleApproveRefund(refundId: string) {
    startTransition(async () => {
      const result = await approveRefundAction(refundId, org.id);
      if (result.error) { setError(result.error); return; }
      setSuccess("Remboursement approuvé.");
      setTimeout(() => window.location.reload(), 1500);
    });
  }

  function handleRejectRefund(refundId: string) {
    startTransition(async () => {
      const result = await rejectRefundAction(refundId, org.id, rejectMessage);
      if (result.error) { setError(result.error); return; }
      setRejectId(null);
      setRejectMessage("");
      setSuccess("Demande refusée.");
      setTimeout(() => window.location.reload(), 1500);
    });
  }

  const payoutStatusLabel: Record<string, { label: string; cls: string }> = {
    PENDING: { label: "En cours", cls: "bg-amber-100 text-amber-700" },
    PAID: { label: "Versé", cls: "bg-green-100 text-green-700" },
    FAILED: { label: "Échoué", cls: "bg-red-100 text-red-700" },
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Finances</h1>
        <p className="text-sm text-gray-500 mt-0.5">Solde, virements et remboursements.</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">✓ {success}</div>}

      {/* Stripe Connect status */}
      {!stripeConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-amber-800 mb-1">Compte bancaire non connecté</h2>
          <p className="text-sm text-amber-700 mb-3">
            Connectez votre compte Stripe pour recevoir les paiements de vos billets.
          </p>
          <button
            type="button"
            onClick={handleConnectStripe}
            disabled={isPending}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {isPending ? "..." : "Connecter mon compte bancaire"}
          </button>
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Solde disponible</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {(org.availableBalanceCents / 100).toFixed(2)}€
          </p>
          {canManage && stripeConnected && org.availableBalanceCents > 0 && (
            <button
              type="button"
              onClick={() => setShowPayoutForm(true)}
              className="mt-3 text-xs text-violet-600 font-medium hover:underline"
            >
              Demander un virement →
            </button>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">En réserve (30j)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {(org.reservedBalanceCents / 100).toFixed(2)}€
          </p>
          {nextReleases[0] && (
            <p className="text-xs text-gray-400 mt-2">
              Prochaine libération : {(nextReleases[0].amountCents / 100).toFixed(2)}€ le{" "}
              {new Date(nextReleases[0].releasesAt).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      </div>

      {/* Payout form */}
      {showPayoutForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Demander un virement</h2>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Montant (€)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                min="1"
                max={(org.availableBalanceCents / 100).toFixed(2)}
                step="0.01"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() => setPayoutAmount((org.availableBalanceCents / 100).toFixed(2))}
                className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Tout
              </button>
            </div>
            <p className="text-xs text-gray-400">Délai estimé : 1-2 jours ouvrés</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowPayoutForm(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button type="button" onClick={handlePayout} disabled={isPending}
              className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {isPending ? "Traitement..." : "Confirmer"}
            </button>
          </div>
        </div>
      )}

      {/* Stripe Express dashboard link */}
      {stripeConnected && (
        <div className="flex justify-end">
          <button type="button" onClick={handleStripeDashboard} disabled={isPending}
            className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
            Tableau de bord Stripe Express →
          </button>
        </div>
      )}

      {/* Pending refunds */}
      {pendingRefunds.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Remboursements en attente
            </h2>
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
              {pendingRefunds.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingRefunds.map((r) => (
              <div key={r.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.buyerName}</p>
                    <p className="text-xs text-gray-400">{r.buyerEmail} · {r.eventTitle}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {(r.amountCents / 100).toFixed(2)}€
                    </p>
                    {r.reason && <p className="text-xs text-gray-500 mt-1 italic">"{r.reason}"</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-gray-400">
                      {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                    {r.isOutOfDeadline && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Hors délai
                      </span>
                    )}
                  </div>
                </div>

                {canManage && (
                  rejectId === r.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={rejectMessage}
                        onChange={(e) => setRejectMessage(e.target.value)}
                        placeholder="Message optionnel pour l'acheteur..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setRejectId(null)}
                          className="flex-1 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50">
                          Annuler
                        </button>
                        <button type="button" onClick={() => handleRejectRefund(r.id)} disabled={isPending}
                          className="flex-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                          Confirmer le refus
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleApproveRefund(r.id)} disabled={isPending}
                        className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                        Approuver
                      </button>
                      <button type="button" onClick={() => setRejectId(r.id)}
                        className="flex-1 px-3 py-1.5 border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors">
                        Refuser
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payout history */}
      {payouts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Historique des virements</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {payouts.map((p) => {
              const s = payoutStatusLabel[p.status] ?? { label: p.status, cls: "bg-gray-100 text-gray-500" };
              return (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {(p.amountCents / 100).toFixed(2)}€
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(p.requestedAt).toLocaleDateString("fr-FR")}
                      {p.paidAt && ` → versé le ${new Date(p.paidAt).toLocaleDateString("fr-FR")}`}
                    </p>
                    {p.failureReason && (
                      <p className="text-xs text-red-500 mt-0.5">{p.failureReason}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
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
