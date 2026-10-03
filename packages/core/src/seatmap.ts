/**
 * Plan de salle (section 9.9) : blocs, géométrie des places, numérotations, modèles de salles et meilleures places.
 * Logique pure, sans base de données : le serveur enregistre ce que ces fonctions calculent.
 *
 * Repère : x vers la droite, y vers le bas. Dans un bloc de rangs, le premier rang (face à la scène) est en y = 0
 * et les rangs suivants s'éloignent vers les y positifs ; la rotation du bloc oriente l'ensemble.
 */

export type SeatNumbering = "ltr" | "rtl" | "odd-left" | "odd-right";
export interface RowLabeling { style: "letters" | "numbers"; start: string; skip: string[] }

export interface RowsParams {
  rows: number;
  seatsFirst: number;
  seatsLast: number;
  seatGap: number;
  rowGap: number;
  /** 0 = rangs droits ; jusqu'à 1 = arc prononcé */
  curve: number;
  centerAisle: boolean;
  aisleGap: number;
  rowLabels: RowLabeling;
  seatNumbering: SeatNumbering;
  seatStart: number;
  /** clé de catégorie par rang, depuis le premier ; le dernier élément vaut pour les rangs suivants */
  categories: string[];
  /** places pour personnes à mobilité réduite : aux extrémités de certains rangs (0 = premier) */
  accessible: Array<{ row: number; ends: number }>;
}
export interface RoundTablesParams { tables: number; seats: number; perRow: number; tableGap: number; labelStart: number; category: string }
export interface RectTablesParams { tables: number; seatsPerSide: number; endSeats: 0 | 1 | 2; perRow: number; tableGap: number; labelStart: number; category: string }
export interface StandingParams { width: number; height: number; capacity: number; label: string; category: string }
export type ShapeType = "stage" | "screen" | "pitch" | "altar" | "bar" | "entrance" | "label";
export interface ShapeParams { shape: ShapeType; width: number; height: number; label: string }

interface BlockBase { name: string; x: number; y: number; rotation: number }
export type BlockSpec =
  | (BlockBase & { kind: "ROWS"; params: RowsParams })
  | (BlockBase & { kind: "TABLE_ROUND"; params: RoundTablesParams })
  | (BlockBase & { kind: "TABLE_RECT"; params: RectTablesParams })
  | (BlockBase & { kind: "STANDING"; params: StandingParams })
  | (BlockBase & { kind: "SHAPE"; params: ShapeParams });

export interface GenSeat { label: string; x: number; y: number; angle: number; order: number; accessible: boolean }
export interface GenRow { label: string; category: string; seats: GenSeat[] }

const r2 = (v: number) => Math.round(v * 100) / 100;

// —— numérotations ——

/** Libellés des places d'un rang, de gauche à droite (vu depuis la salle, face à la scène). */
export function seatNumbers(n: number, mode: SeatNumbering, start = 1): string[] {
  const out = new Array<string>(n);
  if (mode === "ltr") for (let i = 0; i < n; i++) out[i] = String(start + i);
  else if (mode === "rtl") for (let i = 0; i < n; i++) out[i] = String(start + n - 1 - i);
  else {
    // depuis le centre vers les extrémités : impairs d'un côté, pairs de l'autre
    const oddSideCount = Math.ceil(n / 2);
    const left = mode === "odd-left" ? oddSideCount : n - oddSideCount;
    for (let j = 0; j < left; j++) out[left - 1 - j] = String(mode === "odd-left" ? start + 2 * j : start + 1 + 2 * j);
    for (let j = 0; j < n - left; j++) out[left + j] = String(mode === "odd-left" ? start + 1 + 2 * j : start + 2 * j);
  }
  return out;
}

/** Libellé du rang d'indice i (0 = premier rang) : lettres (A, B… Z, AA, AB…) en sautant celles demandées, ou chiffres. */
export function rowLabel(i: number, labeling: RowLabeling): string {
  if (labeling.style === "numbers") return String((Number.parseInt(labeling.start, 10) || 1) + i);
  const skip = new Set(labeling.skip.map((l) => l.toUpperCase()));
  const toLetters = (k: number) => { let s = ""; let v = k; do { s = String.fromCharCode(65 + (v % 26)) + s; v = Math.floor(v / 26) - 1; } while (v >= 0); return s; };
  const fromLetters = (s: string) => [...s.toUpperCase()].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0) - 1;
  let k = Math.max(0, fromLetters(labeling.start || "A"));
  let produced = -1;
  for (;;) {
    const label = toLetters(k);
    if (![...label].some((c) => skip.has(c))) produced += 1;
    if (produced === i) return label;
    k += 1;
  }
}

// —— géométrie ——

function place(block: BlockBase, lx: number, ly: number): { x: number; y: number } {
  const t = (block.rotation * Math.PI) / 180;
  return { x: r2(block.x + lx * Math.cos(t) - ly * Math.sin(t)), y: r2(block.y + lx * Math.sin(t) + ly * Math.cos(t)) };
}

function rowsBlock(b: BlockBase, p: RowsParams): GenRow[] {
  const rows: GenRow[] = [];
  // arc : rayon du premier rang déduit de la courbure (1 → le premier rang couvre environ 120°)
  const radius = p.curve > 0 ? (p.seatsFirst * p.seatGap) / (p.curve * (Math.PI / 1.5)) : 0;
  for (let i = 0; i < p.rows; i++) {
    const n = p.rows === 1 ? p.seatsFirst : Math.round(p.seatsFirst + ((p.seatsLast - p.seatsFirst) * i) / (p.rows - 1));
    const labels = seatNumbers(n, p.seatNumbering, p.seatStart);
    const accessibleEnds = p.accessible.find((a) => a.row === i)?.ends ?? 0;
    const split = Math.ceil(n / 2);
    const seats: GenSeat[] = [];
    for (let k = 0; k < n; k++) {
      const aisle = p.centerAisle && k >= split ? p.aisleGap : 0;
      let lx: number;
      let ly: number;
      let angle = 0;
      if (radius > 0) {
        const R = radius + i * p.rowGap;
        const span = ((n - 1) * p.seatGap + (p.centerAisle ? p.aisleGap : 0)) / R;
        const a = -span / 2 + (k * p.seatGap + aisle) / R;
        lx = R * Math.sin(a);
        ly = -radius + R * Math.cos(a);
        angle = (-a * 180) / Math.PI;
      } else {
        const width = (n - 1) * p.seatGap + (p.centerAisle ? p.aisleGap : 0);
        lx = -width / 2 + k * p.seatGap + aisle;
        ly = i * p.rowGap;
      }
      const pos = place(b, lx, ly);
      seats.push({ label: labels[k]!, x: pos.x, y: pos.y, angle: r2(angle + b.rotation), order: k, accessible: k < accessibleEnds || k >= n - accessibleEnds });
    }
    rows.push({ label: rowLabel(i, p.rowLabels), category: p.categories[Math.min(i, p.categories.length - 1)] ?? "", seats });
  }
  return rows;
}

function roundTables(b: BlockBase, p: RoundTablesParams): GenRow[] {
  const radius = Math.max(26, (p.seats * 26) / (2 * Math.PI)) + 16;
  const cell = 2 * radius + p.tableGap;
  const cols = Math.max(1, p.perRow);
  return Array.from({ length: p.tables }, (_, t) => {
    const cx = (t % cols) * cell - ((cols - 1) * cell) / 2;
    const cy = Math.floor(t / cols) * cell + radius;
    const seats = Array.from({ length: p.seats }, (_, k) => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / p.seats; // première place en haut, sens horaire
      const pos = place(b, cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      return { label: String(k + 1), x: pos.x, y: pos.y, angle: r2(((a + Math.PI / 2) * 180) / Math.PI + b.rotation), order: k, accessible: false };
    });
    return { label: String(p.labelStart + t), category: p.category, seats };
  });
}

function rectTables(b: BlockBase, p: RectTablesParams): GenRow[] {
  const gap = 28;
  const width = p.seatsPerSide * gap;
  const height = 56;
  const cellW = width + 2 * gap + p.tableGap;
  const cellH = height + 2 * gap + p.tableGap;
  const cols = Math.max(1, p.perRow);
  return Array.from({ length: p.tables }, (_, t) => {
    const cx = (t % cols) * cellW - ((cols - 1) * cellW) / 2;
    const cy = Math.floor(t / cols) * cellH + height / 2 + gap;
    const local: Array<{ x: number; y: number; angle: number }> = [];
    for (let k = 0; k < p.seatsPerSide; k++) local.push({ x: cx - width / 2 + gap / 2 + k * gap, y: cy - height / 2 - gap / 2, angle: 0 });
    if (p.endSeats >= 1) local.push({ x: cx + width / 2 + gap / 2, y: cy, angle: 90 });
    for (let k = p.seatsPerSide - 1; k >= 0; k--) local.push({ x: cx - width / 2 + gap / 2 + k * gap, y: cy + height / 2 + gap / 2, angle: 180 });
    if (p.endSeats === 2) local.push({ x: cx - width / 2 - gap / 2, y: cy, angle: 270 });
    const seats = local.map((s, k) => {
      const pos = place(b, s.x, s.y);
      return { label: String(k + 1), x: pos.x, y: pos.y, angle: r2(s.angle + b.rotation), order: k, accessible: false };
    });
    return { label: String(p.labelStart + t), category: p.category, seats };
  });
}

/** Places d'un bloc, en coordonnées du plan. Zones debout et formes n'ont pas de places numérotées. */
export function generateBlock(block: BlockSpec): GenRow[] {
  switch (block.kind) {
    case "ROWS": return rowsBlock(block, block.params);
    case "TABLE_ROUND": return roundTables(block, block.params);
    case "TABLE_RECT": return rectTables(block, block.params);
    default: return [];
  }
}

// —— modèles de salles ——

export const SEATING_TEMPLATES = ["theatre", "hall", "gala", "pit", "church", "cabaret", "conference", "arena", "stadium", "blank"] as const;
export type SeatingTemplate = (typeof SEATING_TEMPLATES)[number];
export interface TemplateOptions { rows?: number; seatsFirst?: number; seatsLast?: number; balconyRows?: number; centerAisle?: boolean; numbering?: SeatNumbering; rowLabels?: RowLabeling; categories?: 1 | 2 | 3; tables?: number; seatsPerTable?: number }
export interface TemplatePlan { blocks: BlockSpec[]; categories: Array<{ key: string; name: string; color: string }>; focus: { x: number; y: number } }

const CATEGORY_DEFAULTS = [
  { key: "c1", name: "Catégorie 1", color: "#FFB8E8" },
  { key: "c2", name: "Catégorie 2", color: "#D9B8F0" },
  { key: "c3", name: "Catégorie 3", color: "#A9C4F2" },
];
const LETTERS: RowLabeling = { style: "letters", start: "A", skip: ["I", "O"] };

function spread(rows: number, count: number): string[] {
  // découpe les rangs en `count` catégories de l'avant vers l'arrière
  return Array.from({ length: rows }, (_, i) => CATEGORY_DEFAULTS[Math.min(count - 1, Math.floor((i * count) / rows))]!.key);
}
function rows(name: string, x: number, y: number, rotation: number, p: Partial<RowsParams> & Pick<RowsParams, "rows" | "seatsFirst" | "seatsLast">): BlockSpec {
  return { kind: "ROWS", name, x, y, rotation, params: { seatGap: 30, rowGap: 34, curve: 0, centerAisle: false, aisleGap: 36, rowLabels: LETTERS, seatNumbering: "ltr", seatStart: 1, categories: ["c1"], accessible: [], ...p } };
}
const shape = (name: string, x: number, y: number, s: ShapeType, width: number, height: number, label: string, rotation = 0): BlockSpec => ({ kind: "SHAPE", name, x, y, rotation, params: { shape: s, width, height, label } });

/** Plan de départ d'un modèle, à ajuster ensuite bloc par bloc. */
export function seatingTemplate(template: SeatingTemplate, o: TemplateOptions = {}): TemplatePlan {
  const nCat = o.categories ?? 3;
  const categories = CATEGORY_DEFAULTS.slice(0, nCat);
  const numbering = o.numbering;
  const labels = o.rowLabels ?? LETTERS;
  const common = (r: number) => ({ rowLabels: labels, categories: spread(r, nCat) });
  switch (template) {
    case "theatre": {
      const r = o.rows ?? 8, balcony = o.balconyRows ?? 3;
      const blocks: BlockSpec[] = [
        shape("Scène", 0, -70, "stage", 380, 56, "SCÈNE"),
        rows("Parterre", 0, 40, 0, { rows: r, seatsFirst: o.seatsFirst ?? 14, seatsLast: o.seatsLast ?? 22, curve: 0.55, centerAisle: o.centerAisle ?? true, seatNumbering: numbering ?? "odd-left", ...common(r), accessible: [{ row: r - 1, ends: 1 }] }),
      ];
      if (balcony > 0) blocks.push(rows("Balcon", 0, 40 + r * 34 + 90, 0, { rows: balcony, seatsFirst: 24, seatsLast: 24, centerAisle: true, seatNumbering: numbering ?? "odd-left", rowLabels: { ...labels, start: rowLabel(r, labels) }, categories: [categories[categories.length - 1]!.key] }));
      return { blocks, categories, focus: { x: 0, y: -70 } };
    }
    case "hall": {
      const r = o.rows ?? 12;
      return { blocks: [shape("Scène", 0, -70, "stage", 420, 56, "SCÈNE"), rows("Salle", 0, 30, 0, { rows: r, seatsFirst: o.seatsFirst ?? 20, seatsLast: o.seatsLast ?? 20, centerAisle: o.centerAisle ?? true, seatNumbering: numbering ?? "ltr", ...common(r), accessible: [{ row: r - 1, ends: 1 }] })], categories, focus: { x: 0, y: -70 } };
    }
    case "gala":
      return { blocks: [shape("Scène", 0, -80, "stage", 420, 56, "SCÈNE"), { kind: "TABLE_ROUND", name: "Tables", x: 0, y: 0, rotation: 0, params: { tables: o.tables ?? 12, seats: o.seatsPerTable ?? 10, perRow: 4, tableGap: 36, labelStart: 1, category: "c1" } }], categories: categories.slice(0, 1), focus: { x: 0, y: -80 } };
    case "pit": {
      const r = o.rows ?? 10;
      return {
        blocks: [shape("Scène", 0, -70, "stage", 460, 56, "SCÈNE"), { kind: "STANDING", name: "Fosse", x: 0, y: 30, rotation: 0, params: { width: 460, height: 170, capacity: 300, label: "FOSSE DEBOUT", category: "c1" } }, rows("Gradins", 0, 250, 0, { rows: r, seatsFirst: o.seatsFirst ?? 30, seatsLast: o.seatsLast ?? 30, centerAisle: o.centerAisle ?? false, seatNumbering: numbering ?? "ltr", ...common(r), categories: [categories[Math.min(1, nCat - 1)]!.key] })],
        categories, focus: { x: 0, y: -70 },
      };
    }
    case "church": {
      const r = o.rows ?? 15, side = o.seatsFirst ?? 8;
      const half = (side * 30) / 2 + 40;
      return {
        blocks: [shape("Chœur", 0, -90, "altar", 300, 70, "CHŒUR"), rows("Bancs gauche", -half, 0, 0, { rows: r, seatsFirst: side, seatsLast: side, seatNumbering: numbering ?? "ltr", ...common(r) }), rows("Bancs droite", half, 0, 0, { rows: r, seatsFirst: side, seatsLast: side, seatNumbering: numbering ?? "ltr", ...common(r) })],
        categories, focus: { x: 0, y: -90 },
      };
    }
    case "cabaret":
      return { blocks: [shape("Scène", 0, -80, "stage", 360, 56, "SCÈNE"), { kind: "TABLE_ROUND", name: "Tables", x: 0, y: 0, rotation: 0, params: { tables: o.tables ?? 16, seats: o.seatsPerTable ?? 4, perRow: 4, tableGap: 30, labelStart: 1, category: "c1" } }, shape("Bar", 0, 520, "bar", 260, 44, "BAR")], categories: categories.slice(0, 1), focus: { x: 0, y: -80 } };
    case "conference": {
      const r = o.rows ?? 10;
      return { blocks: [shape("Écran", 0, -70, "screen", 400, 20, "ÉCRAN"), rows("Salle", 0, 30, 0, { rows: r, seatsFirst: o.seatsFirst ?? 16, seatsLast: o.seatsLast ?? 16, centerAisle: o.centerAisle ?? false, seatNumbering: numbering ?? "ltr", rowLabels: labels, categories: ["c1"], accessible: [{ row: 0, ends: 1 }] })], categories: categories.slice(0, 1), focus: { x: 0, y: -70 } };
    }
    case "arena": {
      const r = o.rows ?? 10, s = o.seatsFirst ?? 20;
      const d = 130;
      const side = (name: string, x: number, y: number, rot: number) => rows(name, x, y, rot, { rows: r, seatsFirst: s, seatsLast: o.seatsLast ?? s + 6, seatNumbering: numbering ?? "ltr", ...common(r) });
      return { blocks: [shape("Scène", 0, 0, "stage", 180, 180, "SCÈNE"), side("Nord", 0, -d, 180), side("Sud", 0, d, 0), side("Est", d, 0, -90), side("Ouest", -d, 0, 90)], categories, focus: { x: 0, y: 0 } };
    }
    case "stadium": {
      const r = o.rows ?? 20, long = o.seatsFirst ?? 60, short = o.seatsLast ?? 40;
      const stand = (name: string, x: number, y: number, rot: number, seats: number, cat: string) => rows(name, x, y, rot, { rows: r, seatsFirst: seats, seatsLast: seats, seatNumbering: numbering ?? "ltr", rowLabels: { style: "numbers", start: "1", skip: [] }, categories: [cat] });
      const c = (i: number) => CATEGORY_DEFAULTS[Math.min(i, nCat - 1)]!.key;
      return {
        blocks: [shape("Terrain", 0, 0, "pitch", 680, 440, "TERRAIN"), stand("Tribune Ouest", -370, 0, 90, long, c(0)), stand("Tribune Est", 370, 0, -90, long, c(1)), stand("Tribune Nord", 0, -250, 180, short, c(2)), stand("Tribune Sud", 0, 250, 0, short, c(2))],
        categories, focus: { x: 0, y: 0 },
      };
    }
    case "blank":
    default:
      return { blocks: [shape("Scène", 0, -70, "stage", 380, 56, "SCÈNE")], categories: categories.slice(0, 1), focus: { x: 0, y: -70 } };
  }
}

// —— meilleures places et sièges isolés ——

export interface PlanSeat { id: string; rowId: string; order: number; x: number; y: number; available: boolean }

/** Segments d'un rang : places consécutives qu'aucune allée ne sépare (écart > 1,6 × l'espacement habituel). */
export function seatSegments(seats: readonly PlanSeat[]): PlanSeat[][] {
  const byRow = new Map<string, PlanSeat[]>();
  for (const s of seats) {
    const row = byRow.get(s.rowId);
    if (row) row.push(s);
    else byRow.set(s.rowId, [s]);
  }
  const out: PlanSeat[][] = [];
  for (const row of byRow.values()) {
    row.sort((a, b) => a.order - b.order);
    const gaps = row.slice(1).map((s, i) => Math.hypot(s.x - row[i]!.x, s.y - row[i]!.y)).sort((a, b) => a - b);
    const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : 0;
    let current: PlanSeat[] = [];
    row.forEach((s, i) => {
      if (i > 0 && usual > 0 && Math.hypot(s.x - row[i - 1]!.x, s.y - row[i - 1]!.y) > usual * 1.6) { out.push(current); current = []; }
      current.push(s);
    });
    if (current.length) out.push(current);
  }
  return out;
}

/** Longueur de la suite de places libres qui finit (left) et qui commence (right) à chaque position d'un segment. */
function freeRuns(seg: readonly PlanSeat[]) {
  const n = seg.length;
  const left = new Array<number>(n).fill(0);
  const right = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) left[i] = seg[i]!.available ? (i > 0 ? left[i - 1]! : 0) + 1 : 0;
  for (let i = n - 1; i >= 0; i--) right[i] = seg[i]!.available ? (i < n - 1 ? right[i + 1]! : 0) + 1 : 0;
  return { left, right };
}

/** Fenêtres de n places libres côte à côte, avec l'indication « laisse une place seule » (temps linéaire). */
function* windows(seats: readonly PlanSeat[], n: number) {
  for (const seg of seatSegments(seats)) {
    const { left, right } = freeRuns(seg);
    for (let i = 0; i + n <= seg.length; i++) {
      if (right[i]! < n) continue;
      const orphan = (i > 0 && left[i - 1] === 1) || (i + n < seg.length && right[i + n] === 1);
      yield { seats: seg.slice(i, i + n), orphan };
    }
  }
}

/** Une place libre se retrouve seule, coincée contre une place choisie (règle des sièges isolés). */
export function createsOrphan(seats: readonly PlanSeat[], chosenIds: readonly string[]): boolean {
  const chosen = new Set(chosenIds);
  const rows = new Set(seats.filter((s) => chosen.has(s.id)).map((s) => s.rowId));
  for (const seg of seatSegments(seats.filter((s) => rows.has(s.rowId)))) {
    const free = seg.map((s) => s.available && !chosen.has(s.id));
    for (let i = 0; i < seg.length; i++) {
      if (!free[i]) continue;
      if ((i > 0 && free[i - 1]) || (i < seg.length - 1 && free[i + 1])) continue; // pas isolée
      if ((i > 0 && chosen.has(seg[i - 1]!.id)) || (i < seg.length - 1 && chosen.has(seg[i + 1]!.id))) return true;
    }
  }
  return false;
}

/**
 * Meilleures places : n places côte à côte dans un même segment, les plus proches du point focal, sans créer de
 * siège isolé ; sinon côte à côte même avec un siège isolé ; sinon les n places libres les plus proches. null si pas assez.
 */
export function bestSeats(seats: readonly PlanSeat[], n: number, focus: { x: number; y: number }): string[] | null {
  if (n <= 0) return [];
  const free = seats.filter((s) => s.available);
  if (free.length < n) return null;
  const dist = (s: PlanSeat) => Math.hypot(s.x - focus.x, s.y - focus.y);
  let best: { ids: string[]; score: number } | null = null;
  let bestWithOrphan: { ids: string[]; score: number } | null = null;
  for (const w of windows(seats, n)) {
    const score = w.seats.reduce((sum, s) => sum + dist(s), 0) / n;
    if (!w.orphan) { if (!best || score < best.score) best = { ids: w.seats.map((s) => s.id), score }; }
    else if (!bestWithOrphan || score < bestWithOrphan.score) bestWithOrphan = { ids: w.seats.map((s) => s.id), score };
  }
  if (best) return best.ids;
  if (bestWithOrphan) return bestWithOrphan.ids;
  return [...free].sort((a, b) => dist(a) - dist(b)).slice(0, n).map((s) => s.id);
}

/** Il existe n places côte à côte qui ne laissent aucun siège isolé (sinon, la règle ne peut pas être imposée). */
export function hasOrphanFreeChoice(seats: readonly PlanSeat[], n: number): boolean {
  for (const w of windows(seats, n)) if (!w.orphan) return true;
  return false;
}
