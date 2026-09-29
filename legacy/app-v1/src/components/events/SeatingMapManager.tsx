"use client";

import { useState, useTransition } from "react";
import {
  createSeatingMapAction,
  addCategoryAction,
  addRowAction,
  toggleSeatChoiceAction,
  blockSeatAction,
} from "@/actions/seating";

interface Seat { id: string; label: string; status: string; }
interface Row { id: string; categoryId: string; name: string; sortOrder: number; seats: Seat[]; }
interface Category {
  id: string; name: string; color: string; ticketTypeId: string | null;
  seatCount: number; soldCount: number;
}
interface SeatingMap { id: string; categories: Category[]; rows: Row[]; }
interface TicketType { id: string; name: string; priceCents: number; }

interface Props {
  eventId: string; orgSlug: string; eventSlug: string;
  allowSeatChoice: boolean;
  seatingMap: SeatingMap | null;
  ticketTypes: TicketType[];
}

const SEAT_COLORS = ["#7c3aed", "#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#0891b2"];

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: "bg-gray-200 hover:bg-violet-400 cursor-pointer",
  SOLD: "bg-green-500 cursor-not-allowed",
  BLOCKED: "bg-gray-500 cursor-pointer",
  RESERVED: "bg-yellow-400 cursor-not-allowed",
};

export function SeatingMapManager({
  eventId, orgSlug, eventSlug, allowSeatChoice,
  seatingMap: initialMap, ticketTypes,
}: Props) {
  const [seatingMap, setSeatingMap] = useState(initialMap);
  const [seatChoice, setSeatChoice] = useState(allowSeatChoice);
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<string | null>(null);

  // Add category form state
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(SEAT_COLORS[0]);
  const [catTicketTypeId, setCatTicketTypeId] = useState(ticketTypes[0]?.id ?? "");

  // Add row form state
  const [showAddRow, setShowAddRow] = useState<string | null>(null); // categoryId
  const [rowName, setRowName] = useState("");
  const [rowSeats, setRowSeats] = useState(10);

  function notify(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  }

  function handleCreateMap() {
    startTransition(async () => {
      const r = await createSeatingMapAction(eventId);
      if (r.error) { notify(r.error); return; }
      window.location.reload();
    });
  }

  function handleAddCategory() {
    if (!catName.trim() || !seatingMap) return;
    startTransition(async () => {
      const r = await addCategoryAction(seatingMap.id, catName, catColor, catTicketTypeId || null);
      if (r.error) { notify(r.error); return; }
      window.location.reload();
    });
  }

  function handleAddRow(categoryId: string) {
    if (!rowName.trim() || !seatingMap) return;
    startTransition(async () => {
      const r = await addRowAction(seatingMap.id, categoryId, rowName, rowSeats);
      if (r.error) { notify(r.error); return; }
      window.location.reload();
    });
  }

  function handleToggleSeatChoice() {
    startTransition(async () => {
      const r = await toggleSeatChoiceAction(eventId, !seatChoice);
      if (r.error) { notify(r.error); return; }
      setSeatChoice(!seatChoice);
    });
  }

  function handleBlockSeat(seatId: string, currentStatus: string) {
    if (currentStatus === "SOLD" || currentStatus === "RESERVED") return;
    startTransition(async () => {
      const newStatus = currentStatus === "BLOCKED" ? "AVAILABLE" : "BLOCKED";
      const r = await blockSeatAction(seatId, newStatus as any);
      if (r.error) { notify(r.error); return; }
      // Update local state
      if (!seatingMap) return;
      setSeatingMap(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map(row => ({
            ...row,
            seats: row.seats.map(s => s.id === seatId ? { ...s, status: newStatus } : s),
          })),
        };
      });
    });
  }

  if (!seatingMap) {
    return (
      <div className="space-y-4 max-w-lg">
        <h2 className="text-base font-semibold text-gray-900">Plan de salle</h2>
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
          <p className="text-3xl">🗺️</p>
          <h3 className="font-semibold text-gray-900">Créer le plan de salle</h3>
          <p className="text-sm text-gray-500">Configurez les catégories et rangs de votre salle.</p>
          <button onClick={handleCreateMap} disabled={isPending}
            className="px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50">
            {isPending ? "..." : "Créer le plan"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Plan de salle</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-600">Choix du siège par l'acheteur</span>
            <button
              type="button"
              role="switch"
              aria-checked={seatChoice}
              onClick={handleToggleSeatChoice}
              disabled={isPending}
              className={`relative w-10 h-5 rounded-full transition-colors ${seatChoice ? "bg-violet-600" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${seatChoice ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </label>
        </div>
      </div>

      {notification && (
        <div className="p-3 bg-violet-50 text-violet-700 rounded-xl text-sm">{notification}</div>
      )}

      {/* Categories */}
      {seatingMap.categories.map(cat => {
        const catRows = seatingMap.rows.filter(r => r.categoryId === cat.id);
        const totalSeats = catRows.reduce((a, r) => a + r.seats.length, 0);

        return (
          <div key={cat.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Category header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{cat.name}</p>
                <p className="text-xs text-gray-400">
                  {totalSeats} sièges · {cat.soldCount} vendus ·{" "}
                  {ticketTypes.find(t => t.id === cat.ticketTypeId)?.name ?? "Aucun ticket associé"}
                </p>
              </div>
              <button
                onClick={() => { setShowAddRow(cat.id); setRowName(""); setRowSeats(10); }}
                className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
              >
                + Rang
              </button>
            </div>

            {/* Add row form */}
            {showAddRow === cat.id && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <input
                  type="text" value={rowName} onChange={e => setRowName(e.target.value)}
                  placeholder="Nom du rang (ex: A, 1)" maxLength={10}
                  className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <input
                  type="number" value={rowSeats} onChange={e => setRowSeats(parseInt(e.target.value) || 0)}
                  min={1} max={100} placeholder="Nb sièges"
                  className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button onClick={() => handleAddRow(cat.id)} disabled={!rowName.trim() || isPending}
                  className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-lg disabled:opacity-50">
                  Ajouter
                </button>
                <button onClick={() => setShowAddRow(null)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
              </div>
            )}

            {/* Rows and seats */}
            {catRows.length === 0 ? (
              <div className="px-4 py-4 text-sm text-gray-400 text-center">
                Aucun rang — ajoutez des rangs pour configurer les sièges.
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {catRows.map(row => (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-gray-500 w-8 flex-shrink-0">{row.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {row.seats.map(seat => (
                        <button
                          key={seat.id}
                          onClick={() => handleBlockSeat(seat.id, seat.status)}
                          title={`${seat.label} — ${seat.status}`}
                          disabled={seat.status === "SOLD" || seat.status === "RESERVED" || isPending}
                          className={`w-6 h-6 rounded text-[9px] font-medium transition-colors ${STATUS_STYLES[seat.status] ?? "bg-gray-200"}`}
                          style={seat.status === "AVAILABLE" ? { backgroundColor: `${cat.color}40`, color: cat.color } : undefined}
                        >
                          {seat.label.replace(row.name, "")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-gray-200 inline-block" /> Disponible</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-green-500 inline-block" /> Vendu</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-gray-500 inline-block" /> Bloqué</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-yellow-400 inline-block" /> Réservé</span>
        <span className="text-gray-400">· Cliquez sur un siège disponible pour le bloquer/débloquer</span>
      </div>

      {/* Add category */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Nouvelle catégorie</h3>
          <button onClick={() => setShowAddCategory(!showAddCategory)}
            className="text-xs text-violet-600 hover:underline">
            {showAddCategory ? "Masquer" : "+ Ajouter"}
          </button>
        </div>
        {showAddCategory && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom</label>
              <input type="text" value={catName} onChange={e => setCatName(e.target.value)}
                placeholder="ex: Carré Or, Fosse" maxLength={50}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ticket associé</label>
              <select value={catTicketTypeId} onChange={e => setCatTicketTypeId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Aucun</option>
                {ticketTypes.map(tt => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Couleur</label>
              <div className="flex gap-1.5">
                {SEAT_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setCatColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${catColor === c ? "border-gray-900 scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <button onClick={handleAddCategory} disabled={!catName.trim() || isPending}
                className="px-4 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-violet-700">
                {isPending ? "..." : "Créer la catégorie"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
