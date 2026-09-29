export interface SeatSlot { id: string; rowOrder: number; seatOrder: number; available: boolean }

/**
 * Section 9.9 : attribution automatique des meilleures places. D'abord n sièges côte à côte dans le premier rang
 * qui en a assez (ordre des rangs puis des sièges) ; sinon, les premiers sièges libres dans l'ordre. null si pas assez.
 */
export function pickSeats(seats: readonly SeatSlot[], n: number): string[] | null {
  if (n <= 0) return [];
  const free = seats.filter((s) => s.available);
  if (free.length < n) return null;
  const rows = new Map<number, SeatSlot[]>();
  for (const s of [...seats].sort((a, b) => a.rowOrder - b.rowOrder || a.seatOrder - b.seatOrder)) rows.set(s.rowOrder, [...(rows.get(s.rowOrder) ?? []), s]);
  for (const row of rows.values()) {
    let run: SeatSlot[] = [];
    for (const s of row) {
      run = s.available ? [...run, s] : [];
      if (run.length === n) return run.map((x) => x.id);
    }
  }
  return [...free].sort((a, b) => a.rowOrder - b.rowOrder || a.seatOrder - b.seatOrder).slice(0, n).map((s) => s.id);
}

/** Libellés d'un rang : « 12 » donne 1 à 12, sinon une liste séparée par des virgules (« 1, 2, 2 bis »). */
export function seatLabels(input: string): string[] | null {
  const v = input.trim();
  if (/^\d{1,3}$/.test(v)) {
    const n = Number(v);
    return n >= 1 && n <= 200 ? Array.from({ length: n }, (_, i) => String(i + 1)) : null;
  }
  const list = v.split(",").map((x) => x.trim()).filter(Boolean);
  if (list.length === 0 || list.length > 200 || list.some((l) => l.length > 10)) return null;
  return new Set(list).size === list.length ? list : null;
}
