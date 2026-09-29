"use client";

import { useState, useTransition } from "react";
import { createPromoCodeAction, togglePromoCodeAction, deletePromoCodeAction } from "@/actions/promoCodes";
import type { PromoCode } from "@evoly/db";

interface TicketTypeSummary {
  id: string;
  name: string;
  priceCents: number;
}

interface Props {
  eventId: string;
  organizationId: string;
  promoCodes: PromoCode[];
  ticketTypes: TicketTypeSummary[];
  canEdit: boolean;
}

export function PromoCodesManager({ eventId, organizationId, promoCodes: initial, ticketTypes, canEdit }: Props) {
  const [codes, setCodes] = useState(initial);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form
  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENTAGE" | "FIXED" | "FREE">("PERCENTAGE");
  const [value, setValue] = useState("10");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);

  function openCreate() {
    setCode(""); setType("PERCENTAGE"); setValue("10");
    setMaxUses(""); setExpiresAt(""); setSelectedTickets([]);
    setError(null);
    setDrawerOpen(true);
  }

  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
    setCode(c);
  }

  function toggleTicket(id: string) {
    setSelectedTickets((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  function handleSubmit() {
    if (type === "PERCENTAGE" && (Number(value) < 1 || Number(value) > 100)) {
      setError("Le pourcentage doit être entre 1 et 100.");
      return;
    }
    const formData = new FormData();
    formData.set("code", code || "AUTO");
    formData.set("type", type);
    formData.set("value", type === "FREE" ? "100" : value);
    if (maxUses) formData.set("maxUses", maxUses);
    if (expiresAt) formData.set("expiresAt", expiresAt);
    selectedTickets.forEach((id) => formData.append("ticketTypeIds", id));

    startTransition(async () => {
      const result = await createPromoCodeAction(eventId, organizationId, formData);
      if (result.error) { setError(result.error); return; }
      window.location.reload();
    });
  }

  function handleToggle(promoId: string, active: boolean) {
    startTransition(async () => {
      await togglePromoCodeAction(promoId, organizationId, active);
      setCodes((prev) => prev.map((c) => c.id === promoId ? { ...c, isActive: active } : c));
    });
  }

  function handleDelete(promoId: string) {
    if (!confirm("Supprimer ce code promo ?")) return;
    startTransition(async () => {
      const result = await deletePromoCodeAction(promoId, organizationId);
      if (result.error) { alert(result.error); return; }
      setCodes((prev) => prev.filter((c) => c.id !== promoId));
    });
  }

  const typeLabel = { PERCENTAGE: "%", FIXED: "€", FREE: "Gratuit" };
  const typeDisplay = (code: PromoCode) => {
    if (code.type === "FREE") return "100% — Gratuit";
    if (code.type === "PERCENTAGE") return `${code.value}%`;
    return `${(code.value / 100).toFixed(2)}€`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Codes promo ({codes.length})</h2>
        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Créer un code
          </button>
        )}
      </div>

      {codes.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-sm text-gray-400 mb-2">Aucun code promo.</p>
          {canEdit && (
            <button onClick={openCreate} className="text-sm text-violet-600 font-medium hover:underline">
              + Créer le premier code
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {codes.map((c) => {
            const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
            return (
              <div key={c.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-sm font-semibold text-gray-900">{c.code}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                      {typeDisplay(c)}
                    </span>
                    {!c.isActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactif</span>
                    )}
                    {expired && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-500">Expiré</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{c.usedCount} utilisation{c.usedCount !== 1 ? "s" : ""}</span>
                    {c.maxUses && <span>/ {c.maxUses} max</span>}
                    {c.expiresAt && <span>· exp. {new Date(c.expiresAt).toLocaleDateString("fr-FR")}</span>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(c.id, !c.isActive)}
                      className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                    >
                      {c.isActive ? "Désactiver" : "Activer"}
                    </button>
                    {c.usedCount === 0 && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Nouveau code promo</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md" aria-label="Fermer">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

              {/* Code */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="EX: SUMMER20"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <button
                    type="button"
                    onClick={generateCode}
                    className="px-3 py-2 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50"
                  >
                    Générer
                  </button>
                </div>
              </div>

              {/* Type */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Type de réduction</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["PERCENTAGE", "FIXED", "FREE"] as const).map((t) => (
                    <label
                      key={t}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 cursor-pointer transition-all text-xs font-medium ${
                        type === t ? "border-violet-600 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <input type="radio" className="sr-only" checked={type === t} onChange={() => setType(t)} />
                      {t === "PERCENTAGE" ? "Pourcentage" : t === "FIXED" ? "Montant fixe" : "Gratuit (100%)"}
                    </label>
                  ))}
                </div>
              </div>

              {/* Value */}
              {type !== "FREE" && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Valeur {type === "PERCENTAGE" ? "(%)" : "(€)"}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      min="1"
                      max={type === "PERCENTAGE" ? "100" : undefined}
                      step={type === "FIXED" ? "0.01" : "1"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      {typeLabel[type]}
                    </span>
                  </div>
                </div>
              )}

              {/* Max uses */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Limite d&apos;utilisations</label>
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  min="1"
                  placeholder="Illimité"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Expiry */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Date d&apos;expiration</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Ticket filter */}
              {ticketTypes.length > 1 && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Tickets concernés <span className="text-gray-400 font-normal">(vide = tous)</span>
                  </label>
                  <div className="space-y-1.5">
                    {ticketTypes.map((tt) => (
                      <label key={tt.id} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTickets.includes(tt.id)}
                          onChange={() => toggleTicket(tt.id)}
                          className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span className="text-sm text-gray-700">{tt.name}</span>
                        <span className="text-xs text-gray-400">
                          {tt.priceCents === 0 ? "Gratuit" : `${(tt.priceCents / 100).toFixed(2)}€`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setDrawerOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {isPending ? "Création..." : "Créer le code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
