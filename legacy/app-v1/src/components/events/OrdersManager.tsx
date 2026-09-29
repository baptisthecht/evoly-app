"use client";

import { useState, useTransition } from "react";
import { approveRefundAction, rejectRefundAction } from "@/actions/refunds";

interface RefundRequest {
  id: string; status: string; ticketIds: string[]; reason: string | null;
  isOutOfDeadline: boolean; responseMessage: string | null; createdAt: string;
}
interface Order {
  id: string; buyerFirstName: string; buyerLastName: string; buyerEmail: string;
  totalCents: number; feesCents: number; status: string; createdAt: string;
  ticketCount: number; checkedInCount: number; magicToken: string;
  refundRequests: RefundRequest[];
}

interface Props {
  organizationId: string;
  canRefund: boolean;
  orders: Order[];
}

const STATUS = {
  PENDING:            { label: "En attente",    bg: "bg-yellow-100 text-yellow-700" },
  COMPLETED:          { label: "Complété",       bg: "bg-green-100 text-green-700" },
  CANCELLED:          { label: "Annulé",         bg: "bg-gray-100 text-gray-500" },
  REFUNDED:           { label: "Remboursé",      bg: "bg-red-100 text-red-600" },
  PARTIALLY_REFUNDED: { label: "Part. remb.",    bg: "bg-orange-100 text-orange-600" },
} as Record<string, { label: string; bg: string }>;

const REFUND_STATUS = {
  PENDING:   { label: "En attente", bg: "bg-amber-100 text-amber-700" },
  APPROVED:  { label: "Approuvée",  bg: "bg-green-100 text-green-700" },
  REJECTED:  { label: "Refusée",    bg: "bg-red-100 text-red-600" },
  PROCESSED: { label: "Traitée",    bg: "bg-blue-100 text-blue-700" },
} as Record<string, { label: string; bg: string }>;

export function OrdersManager({ organizationId, canRefund, orders }: Props) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refundModal, setRefundModal] = useState<{ refundId: string; action: "approve" | "reject" } | null>(null);
  const [refundMessage, setRefundMessage] = useState("");
  const [notification, setNotification] = useState<{ msg: string; ok: boolean } | null>(null);

  function notify(msg: string, ok = true) {
    setNotification({ msg, ok });
    setTimeout(() => setNotification(null), 3000);
  }

  function handleRefundAction() {
    if (!refundModal) return;
    startTransition(async () => {
      const r = refundModal.action === "approve"
        ? await approveRefundAction(refundModal.refundId, organizationId, refundMessage)
        : await rejectRefundAction(refundModal.refundId, organizationId, refundMessage || "Demande refusée.");
      if (r.error) { notify(r.error, false); return; }
      notify(refundModal.action === "approve" ? "Remboursement approuvé" : "Demande refusée");
      setRefundModal(null);
      setRefundMessage("");
      setTimeout(() => window.location.reload(), 800);
    });
  }

  const filtered = orders.filter(o =>
    !search || `${o.buyerFirstName} ${o.buyerLastName} ${o.buyerEmail}`.toLowerCase().includes(search.toLowerCase())
  );

  const pendingRefunds = orders.flatMap(o => o.refundRequests.filter(r => r.status === "PENDING"));

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          Commandes ({orders.length})
        </h2>
      </div>

      {notification && (
        <div className={`p-3 rounded-xl text-sm ${notification.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {notification.msg}
        </div>
      )}

      {/* Pending refunds alert */}
      {canRefund && pendingRefunds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-xl flex-shrink-0">⏳</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {pendingRefunds.length} demande{pendingRefunds.length > 1 ? "s" : ""} de remboursement en attente
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Cliquez sur une commande pour traiter les demandes.</p>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="search"
        placeholder="Rechercher par nom ou email..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          {search ? "Aucun résultat." : "Aucune commande pour l'instant."}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filtered.map(order => {
              const s = STATUS[order.status] ?? { label: order.status, bg: "bg-gray-100 text-gray-500" };
              const pendingRefund = order.refundRequests.find(r => r.status === "PENDING");
              const isExpanded = expandedId === order.id;

              return (
                <div key={order.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-gray-900">
                          {order.buyerFirstName} {order.buyerLastName}
                        </p>
                        {pendingRefund && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                            🔔 Remboursement
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{order.buyerEmail}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-500 hidden sm:block">
                        {order.ticketCount} billet{order.ticketCount > 1 ? "s" : ""}
                        {" · "}
                        {order.checkedInCount}/{order.ticketCount} scannés
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {(order.totalCents / 100).toFixed(2)}€
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg}`}>
                        {s.label}
                      </span>
                      <span className={`text-gray-400 transition-transform text-xs ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>CMD-{order.id.slice(-8).toUpperCase()}</span>
                        <span>{new Date(order.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span>Frais Evoly : {(order.feesCents / 100).toFixed(2)}€</span>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`/tickets/${order.magicToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-white"
                        >
                          Voir les billets →
                        </a>
                      </div>

                      {/* Refund requests */}
                      {order.refundRequests.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-700">Demandes de remboursement</p>
                          {order.refundRequests.map(req => {
                            const rs = REFUND_STATUS[req.status] ?? { label: req.status, bg: "bg-gray-100 text-gray-500" };
                            return (
                              <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rs.bg}`}>{rs.label}</span>
                                    {req.isOutOfDeadline && (
                                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Hors délai</span>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-400">{req.ticketIds.length} billet{req.ticketIds.length > 1 ? "s" : ""}</span>
                                </div>
                                {req.reason && <p className="text-xs text-gray-600">Motif : {req.reason}</p>}
                                {req.responseMessage && <p className="text-xs text-gray-500 italic">Réponse : {req.responseMessage}</p>}
                                {canRefund && req.status === "PENDING" && (
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      onClick={() => { setRefundModal({ refundId: req.id, action: "approve" }); setRefundMessage(""); }}
                                      className="flex-1 text-xs py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                    >
                                      ✓ Approuver
                                    </button>
                                    <button
                                      onClick={() => { setRefundModal({ refundId: req.id, action: "reject" }); setRefundMessage(""); }}
                                      className="flex-1 text-xs py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                                    >
                                      ✕ Refuser
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Refund action modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">
              {refundModal.action === "approve" ? "✓ Approuver le remboursement" : "✕ Refuser le remboursement"}
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Message pour l'acheteur {refundModal.action === "reject" ? "(requis)" : "(optionnel)"}
              </label>
              <textarea
                value={refundMessage}
                onChange={e => setRefundMessage(e.target.value)}
                rows={3}
                placeholder={refundModal.action === "approve" ? "Ex : Remboursement validé, délai 5-10j..." : "Ex : La date limite est dépassée..."}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>
            {refundModal.action === "approve" && (
              <p className="text-xs text-gray-500 bg-blue-50 rounded-lg p-2">
                Un remboursement Stripe sera émis. Les frais de commission ne sont pas remboursés.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setRefundModal(null)}
                className="flex-1 py-2 border border-gray-300 text-sm rounded-xl hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={handleRefundAction}
                disabled={isPending || (refundModal.action === "reject" && !refundMessage)}
                className={`flex-1 py-2 text-white text-sm rounded-xl disabled:opacity-50 transition-colors ${
                  refundModal.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isPending ? "..." : refundModal.action === "approve" ? "Confirmer" : "Refuser"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
