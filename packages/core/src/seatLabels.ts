/**
 * Kit d'installation de salle (section 9.33) : formats de planches d'étiquettes, position de chaque étiquette au millimètre,
 * ordre de pose et répartition en feuilles. Logique pure, sans PDF : le rendu suit exactement ces calculs.
 */

export const A4 = { width: 210, height: 297 } as const; // millimètres

export type SheetFormat = {
  id: string;
  columns: number;
  rows: number;
  labelWidth: number; // mm
  labelHeight: number;
  marginTop: number;
  marginLeft: number;
  gapX: number; // espace entre deux colonnes
  gapY: number; // espace entre deux lignes
  cutMarks: boolean; // papier normal : traits de coupe
};

/** Planches d'autocollants courantes (RG-ETIQ-02) et papier normal avec traits de coupe. */
export const SHEET_PRESETS: Record<string, SheetFormat> = {
  "a4-24": { id: "a4-24", columns: 3, rows: 8, labelWidth: 70, labelHeight: 37, marginTop: 0.5, marginLeft: 0, gapX: 0, gapY: 0, cutMarks: false },
  "a4-21": { id: "a4-21", columns: 3, rows: 7, labelWidth: 63.5, labelHeight: 38.1, marginTop: 15.15, marginLeft: 7.21, gapX: 2.54, gapY: 0, cutMarks: false },
  "a4-8": { id: "a4-8", columns: 2, rows: 4, labelWidth: 105, labelHeight: 74, marginTop: 0.5, marginLeft: 0, gapX: 0, gapY: 0, cutMarks: false },
  "papier-24": { id: "papier-24", columns: 3, rows: 8, labelWidth: 63, labelHeight: 33, marginTop: 16.5, marginLeft: 10.5, gapX: 0, gapY: 0, cutMarks: true },
};

/** Grille personnalisée : les étiquettes se partagent la feuille selon les marges et les espacements choisis. */
export function customFormat(input: {
  columns: number;
  rows: number;
  marginTop: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
  cutMarks?: boolean;
}): SheetFormat {
  const columns = Math.trunc(input.columns),
    rows = Math.trunc(input.rows);
  if (columns < 1 || columns > 6 || rows < 1 || rows > 16) throw new Error("LABEL_GRID_INVALID");
  const labelWidth = (A4.width - 2 * input.marginLeft - (columns - 1) * input.gapX) / columns;
  const labelHeight = (A4.height - 2 * input.marginTop - (rows - 1) * input.gapY) / rows;
  if ([input.marginTop, input.marginLeft, input.gapX, input.gapY].some((v) => !(v >= 0)) || labelWidth < 25 || labelHeight < 15)
    throw new Error("LABEL_GRID_INVALID");
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    id: "personnalise",
    columns,
    rows,
    labelWidth: r(labelWidth),
    labelHeight: r(labelHeight),
    marginTop: input.marginTop,
    marginLeft: input.marginLeft,
    gapX: input.gapX,
    gapY: input.gapY,
    cutMarks: input.cutMarks ?? false,
  };
}

export type Slot = { x: number; y: number; width: number; height: number }; // mm, depuis le coin en haut à gauche de la feuille

/** Emplacements d'une feuille, ligne par ligne puis colonne par colonne : l'ordre dans lequel on décolle les étiquettes. */
export function sheetSlots(f: SheetFormat): Slot[] {
  const slots: Slot[] = [];
  for (let r = 0; r < f.rows; r++)
    for (let c = 0; c < f.columns; c++)
      slots.push({ x: f.marginLeft + c * (f.labelWidth + f.gapX), y: f.marginTop + r * (f.labelHeight + f.gapY), width: f.labelWidth, height: f.labelHeight });
  return slots;
}

/** Marge du haut assez grande pour le repère « Feuille 3/12 · Rang C » (RG-ETIQ-06). */
export const hasSheetMarker = (f: SheetFormat) => f.marginTop >= 8;

export type LabelSeat = {
  id: string;
  block: { name: string; sortOrder: number };
  row: { name: string; sortOrder: number; table: boolean };
  label: string;
  sortOrder: number;
  x: number | null;
  y: number | null;
  category: { name: string; color: string };
  accessible: boolean;
  blocked: boolean;
};

/**
 * Ordre de pose (RG-ETIQ-05) : bloc par bloc, rang par rang, puis les places dans leur ordre réel sur le rang, de gauche à droite
 * pour qui fait face à la scène (point focal du plan). Sans positions ou sans scène : l'ordre du plan.
 */
export function placementOrder(seats: LabelSeat[], focus: { x: number; y: number } | null): LabelSeat[] {
  const rows = new Map<string, LabelSeat[]>();
  for (const s of seats) {
    const key = `${s.block.sortOrder}|${s.block.name}|${s.row.sortOrder}|${s.row.name}`;
    rows.set(key, [...(rows.get(key) ?? []), s]);
  }
  const ordered: LabelSeat[] = [];
  const keys = [...rows.keys()].sort((a, b) => {
    const [ba, , ra] = a.split("|"),
      [bb, , rb] = b.split("|");
    return Number(ba) - Number(bb) || Number(ra) - Number(rb) || a.localeCompare(b);
  });
  for (const key of keys) {
    const row = rows
      .get(key)!
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const placed = row.every((s) => s.x !== null && s.y !== null);
    if (focus && placed && row.length > 1) {
      const cx = row.reduce((n, s) => n + s.x!, 0) / row.length,
        cy = row.reduce((n, s) => n + s.y!, 0) / row.length;
      // face à la scène : direction (vx, vy) vers le point focal ; à droite (axe y vers le bas) : (-vy, vx)
      const vx = focus.x - cx,
        vy = focus.y - cy;
      if (vx !== 0 || vy !== 0) row.sort((a, b) => -vy * a.x! + vx * a.y! - (-vy * b.x! + vx * b.y!) || a.sortOrder - b.sortOrder);
    }
    ordered.push(...row);
  }
  return ordered;
}

export type Sheet = { index: number; slots: { slot: Slot; seat: LabelSeat }[]; rows: string[] };

/** Répartition en feuilles, dans l'ordre de pose, et rangs couverts par chaque feuille (feuille de route du guide). */
export function paginate(seats: LabelSeat[], f: SheetFormat): Sheet[] {
  const slots = sheetSlots(f);
  const sheets: Sheet[] = [];
  seats.forEach((seat, i) => {
    const page = Math.floor(i / slots.length);
    if (!sheets[page]) sheets[page] = { index: page + 1, slots: [], rows: [] };
    sheets[page]!.slots.push({ slot: slots[i % slots.length]!, seat });
    const name = `${seat.block.name} · ${seat.row.name}`;
    if (!sheets[page]!.rows.includes(name)) sheets[page]!.rows.push(name);
  });
  return sheets;
}

/** Liste de contrôle du plan de pose : chaises par rang et au total. */
export function chairCounts(seats: LabelSeat[]) {
  const rows: { block: string; row: string; chairs: number }[] = [];
  for (const s of seats) {
    const last = rows[rows.length - 1];
    if (last && last.block === s.block.name && last.row === s.row.name) last.chairs++;
    else rows.push({ block: s.block.name, row: s.row.name, chairs: 1 });
  }
  return { rows, total: seats.length };
}
