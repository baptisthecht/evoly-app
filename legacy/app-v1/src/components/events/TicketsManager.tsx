"use client";

import { useState, useTransition } from "react";
import {
    createTicketTypeAction,
    updateTicketTypeAction,
    hideTicketTypeAction,
    deleteTicketTypeAction,
} from "@/actions/tickets";
import type { TicketType } from "@evoly/db";

interface Props {
  event: { id: string; status: string };
  ticketTypes: TicketType[];
  organizationId: string;
  orgSlug: string;
  eventSlug: string;
  canEdit: boolean;
  stripeConnected: boolean;
}

type DrawerMode = "create" | "edit";

export function TicketsManager({ event, ticketTypes: initial, organizationId, orgSlug, eventSlug, canEdit, stripeConnected }: Props) {
  const [tickets, setTickets] = useState(initial);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketType | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [priceCents, setPriceCents] = useState(0);
  const [priceInput, setPriceInput] = useState("0");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState<string>("");
  const [isNominative, setIsNominative] = useState(false);
  const [minPerOrder, setMinPerOrder] = useState(1);
  const [maxPerOrder, setMaxPerOrder] = useState(10);

  function openCreate() {
    setEditingTicket(null);
    setName(""); setPriceInput("0"); setPriceCents(0);
    setDescription(""); setQuantity(""); setIsNominative(false);
    setMinPerOrder(1); setMaxPerOrder(10);
    setError(null);
    setDrawerOpen(true);
  }

  function openEdit(tt: TicketType) {
    setEditingTicket(tt);
    setName(tt.name);
    setPriceCents(tt.priceCents);
    setPriceInput((tt.priceCents / 100).toFixed(2));
    setDescription(tt.description ?? "");
    setQuantity(tt.quantity?.toString() ?? "");
    setIsNominative(tt.isNominative);
    setMinPerOrder(tt.minPerOrder);
    setMaxPerOrder(tt.maxPerOrder);
    setError(null);
    setDrawerOpen(true);
  }

  function handlePriceChange(val: string) {
    setPriceInput(val);
    const parsed = parseFloat(val.replace(",", "."));
    if (!isNaN(parsed)) {
      setPriceCents(Math.round(parsed * 100));
    }
  }

  function handleSubmit() {
    if (!name.trim()) { setError("Le nom est requis."); return; }
    if (priceCents > 0 && !stripeConnected) {
      setError("Connectez Stripe pour créer des tickets payants.");
      return;
    }

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("priceCents", priceCents.toString());
    if (quantity) formData.set("quantity", quantity);
    formData.set("isNominative", isNominative.toString());
    formData.set("minPerOrder", minPerOrder.toString());
    formData.set("maxPerOrder", maxPerOrder.toString());

    startTransition(async () => {
      let result;
      if (editingTicket) {
        result = await updateTicketTypeAction(editingTicket.id, organizationId, formData);
      } else {
        result = await createTicketTypeAction(event.id, organizationId, formData);
      }

      if (result.error) {
        setError(result.error);
        return;
      }

      // Refresh by reloading page data
      window.location.reload();
    });
  }

  function handleHide(tt: TicketType) {
    const newHidden = tt.status !== "HIDDEN";
    startTransition(async () => {
      await hideTicketTypeAction(tt.id, organizationId, newHidden);
      window.location.reload();
    });
  }

  function handleDelete(tt: TicketType) {
    if (!confirm(`Supprimer le ticket "${tt.name}" ?`)) return;
    startTransition(async () => {
      const result = await deleteTicketTypeAction(tt.id, organizationId);
      if (result.error) { alert(result.error); return; }
      window.location.reload();
    });
  }

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    HIDDEN: "bg-gray-100 text-gray-500",
    SOLD_OUT: "bg-red-100 text-red-600",
  };
  const statusLabels: Record<string, string> = {
    ACTIVE: "Actif",
    HIDDEN: "Masqué",
    SOLD_OUT: "Complet",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          Types de tickets ({tickets.length})
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un ticket
          </button>
        )}
      </div>

      {!stripeConnected && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <strong>Stripe non connecté.</strong> Seuls les tickets gratuits sont disponibles pour l&apos;instant.{" "}
          <a href={`/dashboard/${orgSlug}/settings`} className="underline">Connecter Stripe</a>
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-sm text-gray-400 mb-3">Aucun ticket configuré.</p>
          {canEdit && (
            <button onClick={openCreate} className="text-sm text-violet-600 font-medium hover:underline">
              + Ajouter le premier ticket
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {tickets.map((tt) => (
            <div key={tt.id} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900">{tt.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColors[tt.status]}`}>
                    {statusLabels[tt.status]}
                  </span>
                  {tt.isNominative && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
                      Nominatif
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{tt.priceCents === 0 ? "Gratuit" : `${(tt.priceCents / 100).toFixed(2)}€`}</span>
                  <span>·</span>
                  <span>
                    {tt.quantitySold}{tt.quantity ? ` / ${tt.quantity}` : ""} vendu{tt.quantitySold !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(tt)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    title="Modifier"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHide(tt)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    title={tt.status === "HIDDEN" ? "Afficher" : "Masquer"}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {tt.status === "HIDDEN"
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      }
                    </svg>
                  </button>
                  {tt.quantitySold === 0 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(tt)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Supprimer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                {editingTicket ? "Modifier le ticket" : "Nouveau ticket"}
              </h3>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md"
                aria-label="Fermer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <DrawerField label="Nom du ticket" required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Entrée générale, VIP, Étudiant..."
                  className={inputCls}
                />
              </DrawerField>

              <DrawerField label="Prix (€)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                  <input
                    type="number"
                    value={priceInput}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    min="0"
                    step="0.01"
                    className={`${inputCls} pl-7`}
                    disabled={editingTicket !== null && editingTicket.quantitySold > 0}
                  />
                </div>
                {editingTicket && editingTicket.quantitySold > 0 && (
                  <p className="text-xs text-amber-600 mt-1">Prix figé (ventes existantes).</p>
                )}
                {priceCents === 0 && <p className="text-xs text-green-600 mt-1">✓ Ticket gratuit — 0% de commission.</p>}
                {priceCents > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Vous recevez{" "}
                    <span className="font-semibold text-gray-700">
                      {((priceCents * 0.95) / 100).toFixed(2)}€
                    </span>{" "}
                    après frais de service (5%)
                  </p>
                )}
              </DrawerField>

              <DrawerField label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${inputCls} resize-y min-h-[80px]`}
                  rows={3}
                  placeholder="Accès aux 2 scènes, boissons incluses..."
                />
              </DrawerField>

              <DrawerField label="Quantité disponible" hint="Laisser vide pour illimité">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  className={inputCls}
                  placeholder="Ex: 200"
                />
              </DrawerField>

              <div className="grid grid-cols-2 gap-4">
                <DrawerField label="Min par commande">
                  <input
                    type="number"
                    value={minPerOrder}
                    onChange={(e) => setMinPerOrder(Number(e.target.value))}
                    min="1"
                    className={inputCls}
                  />
                </DrawerField>
                <DrawerField label="Max par commande">
                  <input
                    type="number"
                    value={maxPerOrder}
                    onChange={(e) => setMaxPerOrder(Number(e.target.value))}
                    min="1"
                    max="100"
                    className={inputCls}
                  />
                </DrawerField>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-10 h-6 rounded-full relative transition-colors ${isNominative ? "bg-violet-600" : "bg-gray-200"}`}
                  onClick={() => setIsNominative(!isNominative)}
                  role="switch"
                  aria-checked={isNominative}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === " " && setIsNominative(!isNominative)}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isNominative ? "left-5" : "left-1"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Ticket nominatif</p>
                  <p className="text-xs text-gray-400">Formulaire par billet (prénom, nom, email)</p>
                </div>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {isPending ? "Enregistrement..." : editingTicket ? "Mettre à jour" : "Créer le ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DrawerField({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors";
