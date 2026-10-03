"use client";

import { SEATING_TEMPLATES, type SeatingTemplate, type TemplateOptions } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import type { SeatingEditorState } from "@/server/seatingEditor";
import { P, RowLabels, S, ShapeView, StandingView, Tables, blockBounds } from "@/components/seating/PlanParts";
import { seatingBlockAction, seatingBlockDeleteAction, seatingCategoryAddAction, seatingCategoryUpdateAction, seatingCommandAction, seatingSeatAction, seatingTemplateAction } from "../../actions";

type Block = SeatingEditorState["blocks"][number];
type Seat = SeatingEditorState["seats"][number];
type BlockInput = { id: string | null; kind: Block["kind"]; name: string; x: number; y: number; rotation: number; params: Record<string, unknown> };
type Selection = { type: "block"; id: string } | { type: "seat"; id: string } | null;
type Result = { ok: boolean; error?: string; data?: unknown } | null | undefined;


const TEMPLATE_DEFAULTS: Record<SeatingTemplate, TemplateOptions> = {
  theatre: { rows: 8, seatsFirst: 14, seatsLast: 22, balconyRows: 3, centerAisle: true, numbering: "odd-left", categories: 3 },
  hall: { rows: 12, seatsFirst: 20, seatsLast: 20, centerAisle: true, numbering: "ltr", categories: 3 },
  gala: { tables: 12, seatsPerTable: 10 },
  pit: { rows: 10, seatsFirst: 30, seatsLast: 30, centerAisle: false, numbering: "ltr", categories: 2 },
  church: { rows: 15, seatsFirst: 8, numbering: "ltr", categories: 2 },
  cabaret: { tables: 16, seatsPerTable: 4 },
  conference: { rows: 10, seatsFirst: 16, seatsLast: 16, centerAisle: false, numbering: "ltr", categories: 1 },
  arena: { rows: 10, seatsFirst: 20, seatsLast: 26, numbering: "ltr", categories: 3 },
  stadium: { rows: 20, seatsFirst: 60, seatsLast: 40, numbering: "ltr", categories: 3 },
  blank: {},
};
const ROW_TEMPLATES = new Set<SeatingTemplate>(["theatre", "hall", "pit", "church", "conference", "arena", "stadium"]);
const TABLE_TEMPLATES = new Set<SeatingTemplate>(["gala", "cabaret"]);

function newBlock(kind: Block["kind"], variant: string, at: { x: number; y: number }, category: string): BlockInput {
  const base = { id: null, x: Math.round(at.x), y: Math.round(at.y), rotation: 0 };
  const rows = { rows: 5, seatsFirst: 10, seatsLast: 10, seatGap: 30, rowGap: 34, curve: 0, centerAisle: false, aisleGap: 36, rowLabels: { style: "letters", start: "A", skip: ["I", "O"] }, seatNumbering: "ltr", seatStart: 1, categories: [category], accessible: [] };
  switch (variant) {
    case "rows": return { ...base, kind: "ROWS", name: "Rangs", params: rows };
    case "arc": return { ...base, kind: "ROWS", name: "Rangs en arc", params: { ...rows, rows: 6, seatsFirst: 12, seatsLast: 18, curve: 0.5, centerAisle: true } };
    case "round": return { ...base, kind: "TABLE_ROUND", name: "Tables rondes", params: { tables: 4, seats: 8, perRow: 4, tableGap: 30, labelStart: 1, category } };
    case "rect": return { ...base, kind: "TABLE_RECT", name: "Tables", params: { tables: 2, seatsPerSide: 4, endSeats: 0, perRow: 2, tableGap: 30, labelStart: 1, category } };
    case "standing": return { ...base, kind: "STANDING", name: "Zone debout", params: { width: 300, height: 160, capacity: 200, label: "ZONE DEBOUT", category } };
    default: {
      const dims: Record<string, [number, number, string]> = { stage: [360, 56, "SCÈNE"], screen: [400, 20, "ÉCRAN"], pitch: [680, 440, "TERRAIN"], altar: [300, 70, "CHŒUR"], bar: [220, 44, "BAR"], entrance: [120, 30, "ENTRÉE"], label: [160, 30, "Texte"] };
      const [width, height, label] = dims[variant] ?? dims.stage!;
      return { ...base, kind: "SHAPE", name: label.charAt(0) + label.slice(1).toLowerCase(), params: { shape: variant, width, height, label } };
    }
  }
}

export function SeatingEditor({ orgSlug, eventId, state, readOnly }: { orgSlug: string; eventId: string; state: SeatingEditorState; readOnly: boolean }) {
  const t = useTranslations("seatingEditor");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [picking, setPicking] = useState(state.blocks.length === 0 && state.seats.length === 0);
  const [undo, setUndo] = useState<Array<{ before: BlockInput; after: BlockInput }>>([]);
  const [redo, setRedo] = useState<Array<{ before: BlockInput; after: BlockInput }>>([]);

  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r && !r.ok) setError(r.error ?? "UNKNOWN");
      else {
        setError(null);
        after?.(r);
        router.refresh();
      }
    });
  /** Action dont l'interface affiche l'effet tout de suite : renvoie false en cas de refus, pour revenir en arrière. */
  const act = async (fn: () => Promise<Result>) => {
    const r = await fn();
    if (r && !r.ok) {
      setError(r.error ?? "UNKNOWN");
      return false;
    }
    setError(null);
    router.refresh();
    return true;
  };
  const saveBlock = (input: BlockInput, record = true) => {
    const before = input.id ? state.blocks.find((b) => b.id === input.id) : undefined;
    run(() => seatingBlockAction(orgSlug, eventId, input), (r) => {
      const id = (r?.data as { id?: string } | undefined)?.id;
      if (id) setSelection({ type: "block", id });
      if (record && before) {
        setUndo((u) => [...u.slice(-29), { before: { ...before }, after: input }]);
        setRedo([]);
      }
    });
  };

  const selectedBlock = selection?.type === "block" ? state.blocks.find((b) => b.id === selection.id) : selection?.type === "seat" ? state.blocks.find((b) => b.id === state.seats.find((s) => s.id === selection.id)?.blockId) : undefined;
  const selectedSeat = selection?.type === "seat" ? state.seats.find((s) => s.id === selection.id) : undefined;
  const firstCategory = state.categories[0]?.id ?? "";

  if (picking && !readOnly)
    return <TemplatePicker pending={pending} error={error} canCancel={state.blocks.length > 0 || state.seats.length > 0} hasSales={state.hasSales} onCancel={() => setPicking(false)} onApply={(template, options) => run(() => seatingTemplateAction(orgSlug, eventId, { template, options }), () => { setPicking(false); setSelection(null); setUndo([]); setRedo([]); })} />;

  const stats = {
    total: state.seats.length,
    blocked: state.seats.filter((s) => s.status === "BLOCKED").length,
    sold: state.seats.filter((s) => s.status === "SOLD").length,
    held: state.seats.filter((s) => s.status === "HELD").length,
    accessible: state.seats.filter((s) => s.accessible).length,
  };

  return (
    <div className="grid gap-4">
      {error ? <p role="alert" className="rounded-[var(--r-card)] bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{t.has(`error_${error}`) ? t(`error_${error}`) : t("errorGeneric")}</p> : null}
      <div className="flex flex-wrap items-start gap-4">
        <section className="grid min-w-0 flex-[999_1_560px] gap-3" aria-labelledby="plan-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="plan-title" className="font-display text-xl tracking-[var(--tracking-title)]">{t("planTitle")}</h2>
            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={!undo.length || pending} onClick={() => { const last = undo[undo.length - 1]!; setUndo((u) => u.slice(0, -1)); setRedo((r) => [...r, last]); saveBlock(last.before, false); }}>{t("undo")}</Button>
                <Button type="button" size="sm" variant="secondary" disabled={!redo.length || pending} onClick={() => { const last = redo[redo.length - 1]!; setRedo((r) => r.slice(0, -1)); setUndo((u) => [...u, last]); saveBlock(last.after, false); }}>{t("redo")}</Button>
                <Button type="button" size="sm" variant="secondary" disabled={state.hasSales || pending} title={state.hasSales ? t("templateLocked") : undefined} onClick={() => setPicking(true)}>{t("changeTemplate")}</Button>
              </div>
            ) : null}
          </div>
          <PlanCanvas state={state} selection={selection} readOnly={readOnly} onSelect={setSelection} onMove={(b, dx, dy) => saveBlock({ ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) })} />
          <p className="text-sm text-ink-muted">{t("stats", { total: stats.total, blocked: stats.blocked, accessible: stats.accessible, sold: stats.sold + stats.held })}</p>
          {!readOnly ? <AddBlocks pending={pending} onAdd={(variant, kind) => saveBlock(newBlock(kind, variant, { x: 0, y: maxY(state) + 120 }, firstCategory))} /> : null}
        </section>
        <aside className="grid min-w-0 flex-[1_1_300px] gap-4">
          <BlockList blocks={state.blocks} selectedId={selectedBlock?.id} onSelect={(id) => setSelection({ type: "block", id })} />
          {selectedSeat ? <SeatPanel key={selectedSeat.id} seat={selectedSeat} readOnly={readOnly} pending={pending} onSave={(patch) => run(() => seatingSeatAction(orgSlug, eventId, selectedSeat.id, patch))} /> : null}
          {selectedBlock ? <BlockPanel key={`${selectedBlock.id}-${JSON.stringify(selectedBlock.params)}-${selectedBlock.rotation}`} block={selectedBlock} categories={state.categories} rowNames={state.rows.filter((r) => r.blockId === selectedBlock.id).map((r) => r.name)} readOnly={readOnly} pending={pending} onSave={(b) => saveBlock(b)} onDelete={() => run(() => seatingBlockDeleteAction(orgSlug, eventId, selectedBlock.id), () => setSelection(null))} /> : null}
          <SeatFinder seats={state.seats} onFound={(id) => setSelection({ type: "seat", id })} />
          <Categories state={state} readOnly={readOnly} pending={pending} onSave={(id, input) => run(() => seatingCategoryUpdateAction(orgSlug, eventId, id, input))} onAdd={(input) => run(() => seatingCategoryAddAction(orgSlug, eventId, input))} />
          <Modes state={state} readOnly={readOnly} onMode={(assigned) => act(() => seatingCommandAction(orgSlug, eventId, { kind: "mode", assigned }))} onChoice={(allow) => act(() => seatingCommandAction(orgSlug, eventId, { kind: "choice", allow }))} />
        </aside>
      </div>
    </div>
  );
}

function maxY(state: SeatingEditorState) {
  const ys = [...state.seats.map((s) => s.y), ...state.blocks.map((b) => b.y + P(b, "height", 0) / 2)];
  return ys.length ? Math.max(...ys) : 0;
}

// —— plan ——

function PlanCanvas({ state, selection, readOnly, onSelect, onMove }: { state: SeatingEditorState; selection: Selection; readOnly: boolean; onSelect: (s: Selection) => void; onMove: (b: Block, dx: number, dy: number) => void }) {
  const t = useTranslations("seatingEditor");
  const svgRef = useRef<SVGSVGElement>(null);
  const colors = useMemo(() => new Map(state.categories.map((c) => [c.id, c.color])), [state.categories]);
  const bounds = useMemo(() => {
    const boxes = [...state.blocks.map((b) => blockBounds(b, state.seats)), ...state.seats.filter((s) => !s.blockId).map((s) => ({ x1: s.x - 16, y1: s.y - 16, x2: s.x + 16, y2: s.y + 16 }))];
    if (!boxes.length) return { x: -300, y: -200, w: 600, h: 400 };
    const x1 = Math.min(...boxes.map((b) => b.x1)) - 60, y1 = Math.min(...boxes.map((b) => b.y1)) - 60;
    const x2 = Math.max(...boxes.map((b) => b.x2)) + 60, y2 = Math.max(...boxes.map((b) => b.y2)) + 60;
    return { x: x1, y: y1, w: Math.max(200, x2 - x1), h: Math.max(160, y2 - y1) };
  }, [state.blocks, state.seats]);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ blockId: string; dx: number; dy: number } | null>(null);
  const gesture = useRef<{ kind: "block" | "pan" | "click"; blockId?: string; seatId?: string; x: number; y: number; moved: boolean; c0: { x: number; y: number } } | null>(null);
  const c = center ?? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const vb = { w: bounds.w / zoom, h: bounds.h / zoom };
  const viewBox = `${c.x - vb.w / 2} ${c.y - vb.h / 2} ${vb.w} ${vb.h}`;

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(8, Math.max(0.5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const unitsPerPx = () => vb.w / (svgRef.current?.clientWidth || 1);
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    const el = (e.target as Element).closest("[data-block],[data-seat]");
    const blockId = el?.getAttribute("data-block") ?? undefined;
    const seatId = el?.getAttribute("data-seat") ?? undefined;
    gesture.current = { kind: blockId && !readOnly ? "block" : el ? "click" : "pan", blockId, seatId, x: e.clientX, y: e.clientY, moved: false, c0: c };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dxPx = e.clientX - g.x, dyPx = e.clientY - g.y;
    if (!g.moved && Math.hypot(dxPx, dyPx) < 5) return;
    g.moved = true;
    const k = unitsPerPx();
    if (g.kind === "block" && g.blockId) setDrag({ blockId: g.blockId, dx: dxPx * k, dy: dyPx * k });
    if (g.kind === "pan") setCenter({ x: g.c0.x - dxPx * k, y: g.c0.y - dyPx * k });
  };
  const up = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.moved && g.kind === "block" && drag) {
      const b = state.blocks.find((x) => x.id === drag.blockId);
      setDrag(null);
      if (b) onMove(b, Math.round(drag.dx / 5) * 5, Math.round(drag.dy / 5) * 5);
      return;
    }
    setDrag(null);
    if (g.moved) return;
    if (g.seatId) onSelect({ type: "seat", id: g.seatId });
    else if (g.blockId) onSelect({ type: "block", id: g.blockId });
    else onSelect(null);
  };

  const selectedBlockId = selection?.type === "block" ? selection.id : selection?.type === "seat" ? state.seats.find((s) => s.id === selection.id)?.blockId : null;
  const showLabels = zoom >= 1.6;
  const groups = [...state.blocks.map((b) => ({ block: b as Block | null, seats: state.seats.filter((s) => s.blockId === b.id) })), { block: null, seats: state.seats.filter((s) => !s.blockId) }];

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" aria-label={t("zoomOut")} onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>−</Button>
        <span className="min-w-14 text-center font-label text-sm font-bold tabular-nums">{Math.round(zoom * 100)} %</span>
        <Button type="button" size="sm" variant="secondary" aria-label={t("zoomIn")} onClick={() => setZoom((z) => Math.min(8, z * 1.25))}>+</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setZoom(1); setCenter(null); }}>{t("fit")}</Button>
        <span className="text-sm text-ink-muted">{readOnly ? t("hintReadOnly") : t("hint")}</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        role="img"
        aria-label={t("planLabel", { seats: state.seats.length })}
        className="h-[clamp(360px,62vh,760px)] w-full touch-none select-none rounded-[var(--r-card)] border border-line bg-surface-sunken"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => { gesture.current = null; setDrag(null); }}
      >
        <defs>
          <pattern id="seat-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="#EFE9E5" />
            <rect width="2.5" height="5" fill="#B9AFA9" />
          </pattern>
        </defs>
        {groups.map(({ block, seats }) => {
          const offset = block && drag?.blockId === block.id ? `translate(${drag.dx} ${drag.dy})` : undefined;
          const selected = block && block.id === selectedBlockId;
          const box = block ? blockBounds(block, seats) : null;
          return (
            <g key={block?.id ?? "legacy"} transform={offset} data-block={block?.id} style={{ cursor: block && !readOnly ? "move" : "default" }}>
              {block?.kind === "SHAPE" ? <ShapeView block={block} /> : null}
              {block?.kind === "STANDING" ? <StandingView block={block} color={colors.get(S(block, "category")) ?? "#FFB8E8"} /> : null}
              {block && (block.kind === "TABLE_ROUND" || block.kind === "TABLE_RECT") ? <Tables block={block} seats={seats} rows={state.rows} /> : null}
              {block?.kind === "ROWS" ? <RowLabels seats={seats} rows={state.rows.filter((r) => r.blockId === block.id)} /> : null}
              {seats.map((s) => (
                <g key={s.id} data-seat={s.id} data-block={s.blockId ?? undefined} transform={`translate(${s.x} ${s.y}) rotate(${s.angle})`}>
                  <rect x={-11} y={-9.5} width={22} height={19} rx={5} fill={s.status === "SOLD" ? "#4A4441" : s.status === "BLOCKED" ? "url(#seat-hatch)" : colors.get(s.categoryId) ?? "#D9B8F0"} stroke={selection?.type === "seat" && selection.id === s.id ? "#3B5BDB" : s.status === "HELD" ? "#C2410C" : "none"} strokeWidth={selection?.type === "seat" && selection.id === s.id ? 3 : 2} />
                  {s.accessible ? <circle r={4.5} fill="#FFFFFF" stroke="#222222" strokeWidth={1.5} /> : null}
                  {showLabels && !s.accessible ? <text y={3} textAnchor="middle" fontSize={8} fontWeight={700} fill={s.status === "SOLD" ? "#FFFFFF" : "#222222"} style={{ pointerEvents: "none" }}>{s.label}</text> : null}
                </g>
              ))}
              {selected && box ? <rect x={box.x1 - 6} y={box.y1 - 6} width={box.x2 - box.x1 + 12} height={box.y2 - box.y1 + 12} rx={12} fill="none" stroke="#3B5BDB" strokeWidth={2} strokeDasharray="7 6" style={{ pointerEvents: "none" }} /> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// —— panneaux ——

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `panel-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-[var(--r-card)] border border-line bg-surface-raised p-4">
      <h3 id={id} className="font-display text-lg tracking-[var(--tracking-title)]">{title}</h3>
      {children}
    </section>
  );
}
function NumberField({ id, label, value, onChange, min, max, step = 1, disabled }: { id: string; label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; disabled?: boolean }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-label text-sm font-bold">{label}</label>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ""} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function AddBlocks({ pending, onAdd }: { pending: boolean; onAdd: (variant: string, kind: Block["kind"]) => void }) {
  const t = useTranslations("seatingEditor");
  const items: Array<[string, Block["kind"]]> = [["rows", "ROWS"], ["arc", "ROWS"], ["round", "TABLE_ROUND"], ["rect", "TABLE_RECT"], ["standing", "STANDING"], ["stage", "SHAPE"], ["screen", "SHAPE"], ["pitch", "SHAPE"], ["bar", "SHAPE"], ["entrance", "SHAPE"], ["label", "SHAPE"]];
  return (
    <Panel title={t("add")}>
      <div className="flex flex-wrap gap-2">
        {items.map(([variant, kind]) => (
          <Button key={variant} type="button" size="sm" variant="secondary" disabled={pending} onClick={() => onAdd(variant, kind)}>{t(`add_${variant}`)}</Button>
        ))}
      </div>
    </Panel>
  );
}

function BlockList({ blocks, selectedId, onSelect }: { blocks: Block[]; selectedId?: string; onSelect: (id: string) => void }) {
  const t = useTranslations("seatingEditor");
  if (!blocks.length) return null;
  return (
    <Panel title={t("blocks")}>
      <ul className="flex flex-wrap gap-2">
        {blocks.map((b) => (
          <li key={b.id}>
            <Button type="button" size="sm" variant={b.id === selectedId ? "dark" : "secondary"} aria-pressed={b.id === selectedId} onClick={() => onSelect(b.id)}>{b.name}</Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function BlockPanel({ block, categories, rowNames, readOnly, pending, onSave, onDelete }: { block: Block; categories: SeatingEditorState["categories"]; rowNames: string[]; readOnly: boolean; pending: boolean; onSave: (b: BlockInput) => void; onDelete: () => void }) {
  const t = useTranslations("seatingEditor");
  const [b, setB] = useState<BlockInput>({ ...block, params: { ...block.params } });
  const set = (key: string, value: unknown) => setB((x) => ({ ...x, params: { ...x.params, [key]: value } }));
  const num = (key: string, fallback: number) => P(b, key, fallback);
  const catSelect = (id: string, value: string, onChange: (v: string) => void, label: string) => (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-label text-sm font-bold">{label}</label>
      <Select id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
    </div>
  );
  const rowCats = (Array.isArray(b.params.categories) ? (b.params.categories as string[]) : []);
  const labels = (b.params.rowLabels ?? { style: "letters", start: "A", skip: [] }) as { style: string; start: string; skip: string[] };
  return (
    <Panel title={t("blockTitle", { name: block.name })}>
      <div className="grid gap-1">
        <label htmlFor="blk-name" className="font-label text-sm font-bold">{t("name")}</label>
        <Input id="blk-name" value={b.name} maxLength={40} disabled={readOnly} onChange={(e) => setB({ ...b, name: e.target.value })} />
      </div>
      <div className="grid gap-1">
        <label htmlFor="blk-rot" className="font-label text-sm font-bold">{t("rotation", { deg: Math.round(b.rotation) })}</label>
        <input id="blk-rot" type="range" min={-180} max={180} step={5} value={b.rotation} disabled={readOnly} onChange={(e) => setB({ ...b, rotation: Number(e.target.value) })} className="accent-[var(--ink)]" />
      </div>
      {b.kind === "ROWS" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField id="blk-rows" label={t("rows")} value={num("rows", 5)} min={1} max={100} disabled={readOnly} onChange={(v) => set("rows", v)} />
            <NumberField id="blk-start" label={t("seatStart")} value={num("seatStart", 1)} min={0} max={9999} disabled={readOnly} onChange={(v) => set("seatStart", v)} />
            <NumberField id="blk-first" label={t("seatsFirst")} value={num("seatsFirst", 10)} min={1} max={200} disabled={readOnly} onChange={(v) => set("seatsFirst", v)} />
            <NumberField id="blk-last" label={t("seatsLast")} value={num("seatsLast", 10)} min={1} max={200} disabled={readOnly} onChange={(v) => set("seatsLast", v)} />
          </div>
          <div className="grid gap-1">
            <label htmlFor="blk-curve" className="font-label text-sm font-bold">{t("curve")}</label>
            <input id="blk-curve" type="range" min={0} max={1} step={0.05} value={num("curve", 0)} disabled={readOnly} onChange={(e) => set("curve", Number(e.target.value))} className="accent-[var(--ink)]" />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={b.params.centerAisle === true} disabled={readOnly} onChange={(e) => set("centerAisle", e.target.checked)} className="size-5 accent-[var(--ink)]" />{t("centerAisle")}</label>
          <div className="grid gap-1">
            <label htmlFor="blk-num" className="font-label text-sm font-bold">{t("numbering")}</label>
            <Select id="blk-num" value={S(b, "seatNumbering", "ltr")} disabled={readOnly} onChange={(e) => set("seatNumbering", e.target.value)}>
              {["ltr", "rtl", "odd-left", "odd-right"].map((m) => <option key={m} value={m}>{t(`numbering_${m}`)}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <label htmlFor="blk-rl" className="font-label text-sm font-bold">{t("rowLabels")}</label>
              <Select id="blk-rl" value={labels.style} disabled={readOnly} onChange={(e) => set("rowLabels", { ...labels, style: e.target.value, start: e.target.value === "numbers" ? "1" : "A" })}>
                <option value="letters">{t("rowLetters")}</option>
                <option value="numbers">{t("rowNumbers")}</option>
              </Select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="blk-rs" className="font-label text-sm font-bold">{t("rowStart")}</label>
              <Input id="blk-rs" value={labels.start} maxLength={3} disabled={readOnly} onChange={(e) => set("rowLabels", { ...labels, start: e.target.value.toUpperCase() })} />
            </div>
          </div>
          {labels.style === "letters" ? (
            <div className="grid gap-1">
              <label htmlFor="blk-skip" className="font-label text-sm font-bold">{t("skipLetters")}</label>
              <Input id="blk-skip" value={labels.skip.join(", ")} disabled={readOnly} onChange={(e) => set("rowLabels", { ...labels, skip: e.target.value.toUpperCase().split(/[\s,;]+/).filter((l) => /^[A-Z]$/.test(l)).slice(0, 10) })} />
            </div>
          ) : null}
          {catSelect("blk-cat", rowCats[0] ?? categories[0]?.id ?? "", (v) => set("categories", [v]), t("categoryAll"))}
          <details className="grid gap-2">
            <summary className="cursor-pointer font-label text-sm font-bold">{t("categoryPerRow")}</summary>
            <div className="mt-2 grid gap-2">
              {Array.from({ length: num("rows", 1) }, (_, i) => catSelect(`blk-cat-${i}`, rowCats[Math.min(i, rowCats.length - 1)] ?? categories[0]?.id ?? "", (v) => {
                const next = Array.from({ length: num("rows", 1) }, (_, k) => rowCats[Math.min(k, rowCats.length - 1)] ?? categories[0]?.id ?? "");
                next[i] = v;
                set("categories", next);
              }, t("rowCategory", { row: rowNames[i] ?? String(i + 1) })))}
            </div>
          </details>
        </>
      ) : null}
      {b.kind === "TABLE_ROUND" || b.kind === "TABLE_RECT" ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField id="blk-tables" label={t("tables")} value={num("tables", 4)} min={1} max={200} disabled={readOnly} onChange={(v) => set("tables", v)} />
          {b.kind === "TABLE_ROUND"
            ? <NumberField id="blk-seats" label={t("seatsPerTable")} value={num("seats", 8)} min={1} max={30} disabled={readOnly} onChange={(v) => set("seats", v)} />
            : <NumberField id="blk-side" label={t("seatsPerSide")} value={num("seatsPerSide", 4)} min={1} max={30} disabled={readOnly} onChange={(v) => set("seatsPerSide", v)} />}
          <NumberField id="blk-per" label={t("perRow")} value={num("perRow", 4)} min={1} max={30} disabled={readOnly} onChange={(v) => set("perRow", v)} />
          <NumberField id="blk-lbl" label={t("firstTable")} value={num("labelStart", 1)} min={0} max={9999} disabled={readOnly} onChange={(v) => set("labelStart", v)} />
          {b.kind === "TABLE_RECT" ? (
            <div className="col-span-2 grid gap-1">
              <label htmlFor="blk-ends" className="font-label text-sm font-bold">{t("endSeats")}</label>
              <Select id="blk-ends" value={String(num("endSeats", 0))} disabled={readOnly} onChange={(e) => set("endSeats", Number(e.target.value))}>
                {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          ) : null}
          <div className="col-span-2">{catSelect("blk-tcat", S(b, "category", categories[0]?.id ?? ""), (v) => set("category", v), t("category"))}</div>
        </div>
      ) : null}
      {b.kind === "STANDING" || b.kind === "SHAPE" ? (
        <div className="grid grid-cols-2 gap-2">
          {b.kind === "SHAPE" ? (
            <div className="col-span-2 grid gap-1">
              <label htmlFor="blk-shape" className="font-label text-sm font-bold">{t("shape")}</label>
              <Select id="blk-shape" value={S(b, "shape", "stage")} disabled={readOnly} onChange={(e) => set("shape", e.target.value)}>
                {["stage", "screen", "pitch", "altar", "bar", "entrance", "label"].map((s) => <option key={s} value={s}>{t(`shape_${s}`)}</option>)}
              </Select>
            </div>
          ) : null}
          <div className="col-span-2 grid gap-1">
            <label htmlFor="blk-text" className="font-label text-sm font-bold">{t("label")}</label>
            <Input id="blk-text" value={S(b, "label")} maxLength={40} disabled={readOnly} onChange={(e) => set("label", e.target.value)} />
          </div>
          <NumberField id="blk-w" label={t("width")} value={num("width", 200)} min={10} max={5000} disabled={readOnly} onChange={(v) => set("width", v)} />
          <NumberField id="blk-h" label={t("height")} value={num("height", 40)} min={10} max={5000} disabled={readOnly} onChange={(v) => set("height", v)} />
          {b.kind === "STANDING" ? (
            <>
              <NumberField id="blk-cap" label={t("capacity")} value={num("capacity", 100)} min={1} max={100000} disabled={readOnly} onChange={(v) => set("capacity", v)} />
              <div>{catSelect("blk-scat", S(b, "category", categories[0]?.id ?? ""), (v) => set("category", v), t("category"))}</div>
            </>
          ) : null}
        </div>
      ) : null}
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => onSave(b)}>{t("saveBlock")}</Button>
          <Button type="button" variant="danger" disabled={pending} onClick={onDelete}>{t("deleteBlock")}</Button>
        </div>
      ) : null}
    </Panel>
  );
}

function SeatPanel({ seat, readOnly, pending, onSave }: { seat: Seat; readOnly: boolean; pending: boolean; onSave: (patch: { label?: string; blocked?: boolean; accessible?: boolean; note?: string | null }) => void }) {
  const t = useTranslations("seatingEditor");
  const [label, setLabel] = useState(seat.label);
  const [blocked, setBlocked] = useState(seat.status === "BLOCKED");
  const [accessible, setAccessible] = useState(seat.accessible);
  const [note, setNote] = useState(seat.note ?? "");
  const taken = seat.status === "SOLD" || seat.status === "HELD";
  return (
    <Panel title={t("seatTitle", { row: seat.row, seat: seat.label })}>
      <p className="-mt-1 text-sm text-ink-muted">{t(`status_${seat.status}`)}</p>
      <div className="grid gap-1">
        <label htmlFor="seat-label" className="font-label text-sm font-bold">{t("seatLabel")}</label>
        <Input id="seat-label" value={label} maxLength={12} disabled={readOnly || taken} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={accessible} disabled={readOnly} onChange={(e) => setAccessible(e.target.checked)} className="size-5 accent-[var(--ink)]" />{t("accessible")}</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={blocked} disabled={readOnly || taken} onChange={(e) => setBlocked(e.target.checked)} className="size-5 accent-[var(--ink)]" />{t("blocked")}</label>
      <div className="grid gap-1">
        <label htmlFor="seat-note" className="font-label text-sm font-bold">{t("note")}</label>
        <Input id="seat-note" value={note} maxLength={80} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
      </div>
      {!readOnly ? (
        <Button type="button" disabled={pending} onClick={() => onSave({ ...(label.trim() !== seat.label && !taken ? { label: label.trim() } : {}), ...(!taken && blocked !== (seat.status === "BLOCKED") ? { blocked } : {}), accessible, note: note.trim() || null })}>{t("saveSeat")}</Button>
      ) : null}
    </Panel>
  );
}

function SeatFinder({ seats, onFound }: { seats: Seat[]; onFound: (id: string) => void }) {
  const t = useTranslations("seatingEditor");
  const [row, setRow] = useState("");
  const [label, setLabel] = useState("");
  const [missing, setMissing] = useState(false);
  if (!seats.length) return null;
  return (
    <Panel title={t("findSeat")}>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const s = seats.find((x) => x.row.toUpperCase() === row.trim().toUpperCase() && x.label.toUpperCase() === label.trim().toUpperCase()); setMissing(!s); if (s) onFound(s.id); }}>
        <div className="grid w-24 gap-1"><label htmlFor="find-row" className="font-label text-sm font-bold">{t("row")}</label><Input id="find-row" value={row} maxLength={12} onChange={(e) => setRow(e.target.value)} /></div>
        <div className="grid w-24 gap-1"><label htmlFor="find-seat" className="font-label text-sm font-bold">{t("seat")}</label><Input id="find-seat" value={label} maxLength={12} onChange={(e) => setLabel(e.target.value)} /></div>
        <Button type="submit" variant="secondary">{t("find")}</Button>
      </form>
      {missing ? <p role="status" className="text-sm text-danger">{t("notFound")}</p> : null}
    </Panel>
  );
}

function Categories({ state, readOnly, pending, onSave, onAdd }: { state: SeatingEditorState; readOnly: boolean; pending: boolean; onSave: (id: string, input: { name: string; color: string; ticketTypeIds: string[] }) => void; onAdd: (input: { name: string; color: string }) => void }) {
  const t = useTranslations("seatingEditor");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#A9C4F2");
  return (
    <Panel title={t("categories")}>
      <p className="-mt-1 text-sm text-ink-muted">{t("categoriesHint")}</p>
      {state.categories.map((c) => <CategoryRow key={`${c.id}-${c.name}-${c.color}-${c.ticketTypeIds.join()}`} category={c} ticketTypes={state.ticketTypes} readOnly={readOnly} pending={pending} onSave={(input) => onSave(c.id, input)} />)}
      {!readOnly ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { onAdd({ name: newName.trim(), color: newColor }); setNewName(""); } }}>
          <input type="color" aria-label={t("color")} value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-11 w-12 rounded-md border border-line" />
          <div className="grid min-w-0 flex-1 gap-1"><label htmlFor="cat-new" className="font-label text-sm font-bold">{t("newCategory")}</label><Input id="cat-new" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} /></div>
          <Button type="submit" variant="secondary" disabled={pending}>{t("addCategory")}</Button>
        </form>
      ) : null}
    </Panel>
  );
}

function CategoryRow({ category, ticketTypes, readOnly, pending, onSave }: { category: SeatingEditorState["categories"][number]; ticketTypes: SeatingEditorState["ticketTypes"]; readOnly: boolean; pending: boolean; onSave: (input: { name: string; color: string; ticketTypeIds: string[] }) => void }) {
  const t = useTranslations("seatingEditor");
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [types, setTypes] = useState<string[]>(category.ticketTypeIds);
  return (
    <fieldset className="grid gap-2 rounded-md border border-line p-3">
      <legend className="px-1 font-label text-sm font-bold">{category.name}</legend>
      <div className="flex items-end gap-2">
        <input type="color" aria-label={t("colorOf", { name: category.name })} value={color} disabled={readOnly} onChange={(e) => setColor(e.target.value)} className="h-11 w-12 rounded-md border border-line" />
        <div className="grid min-w-0 flex-1 gap-1"><label htmlFor={`cat-${category.id}`} className="sr-only">{t("name")}</label><Input id={`cat-${category.id}`} value={name} maxLength={40} disabled={readOnly} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap gap-x-4">
        {ticketTypes.map((tt) => (
          <label key={tt.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={types.includes(tt.id)} disabled={readOnly} onChange={(e) => setTypes((x) => (e.target.checked ? [...x, tt.id] : x.filter((v) => v !== tt.id)))} className="size-5 accent-[var(--ink)]" />{tt.name}</label>
        ))}
      </div>
      {!readOnly ? <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => onSave({ name: name.trim(), color, ticketTypeIds: types })}>{t("saveCategory")}</Button> : null}
    </fieldset>
  );
}

function Modes({ state, readOnly, onMode, onChoice }: { state: SeatingEditorState; readOnly: boolean; onMode: (assigned: boolean) => Promise<boolean>; onChoice: (allow: boolean) => Promise<boolean> }) {
  const t = useTranslations("seatingEditor");
  // état affiché tout de suite, rétabli si le serveur refuse ; resynchronisé avec le plan rechargé
  const [assigned, setAssigned] = useState(state.mode === "ASSIGNED");
  const [choice, setChoice] = useState(state.allowChoice);
  useEffect(() => setAssigned(state.mode === "ASSIGNED"), [state.mode]);
  useEffect(() => setChoice(state.allowChoice), [state.allowChoice]);
  return (
    <Panel title={t("sales")}>
      <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={assigned} disabled={readOnly} onChange={(e) => { const v = e.target.checked; setAssigned(v); void onMode(v).then((ok) => { if (!ok) setAssigned(!v); }); }} className="mt-0.5 size-5 accent-[var(--ink)]" /><span><strong>{t("assigned")}</strong><br />{t("assignedHint")}</span></label>
      <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={choice} disabled={readOnly || !assigned} onChange={(e) => { const v = e.target.checked; setChoice(v); void onChoice(v).then((ok) => { if (!ok) setChoice(!v); }); }} className="mt-0.5 size-5 accent-[var(--ink)]" /><span><strong>{t("choice")}</strong><br />{t("choiceHint")}</span></label>
    </Panel>
  );
}

// —— modèles ——

function TemplatePicker({ pending, error, canCancel, hasSales, onCancel, onApply }: { pending: boolean; error: string | null; canCancel: boolean; hasSales: boolean; onCancel: () => void; onApply: (t: SeatingTemplate, o: TemplateOptions) => void }) {
  const t = useTranslations("seatingEditor");
  const [template, setTemplate] = useState<SeatingTemplate>("theatre");
  const [o, setO] = useState<TemplateOptions>(TEMPLATE_DEFAULTS.theatre);
  const choose = (tpl: SeatingTemplate) => { setTemplate(tpl); setO(TEMPLATE_DEFAULTS[tpl]); };
  const field = (key: keyof TemplateOptions, label: string, min: number, max: number) => (
    <NumberField id={`tpl-${key}`} label={label} value={(o[key] as number) ?? min} min={min} max={max} onChange={(v) => setO({ ...o, [key]: v })} />
  );
  return (
    <div className="grid gap-4">
      {error ? <p role="alert" className="rounded-[var(--r-card)] bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{t.has(`error_${error}`) ? t(`error_${error}`) : t("errorGeneric")}</p> : null}
      {canCancel ? <p className="text-sm font-semibold text-warning">{hasSales ? t("templateLocked") : t("templateReplaces")}</p> : null}
      <div className="flex flex-wrap items-start gap-4">
        <fieldset className="grid min-w-0 flex-[999_1_520px] grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          <legend className="mb-2 font-display text-xl tracking-[var(--tracking-title)]">{t("chooseTemplate")}</legend>
          {SEATING_TEMPLATES.map((tpl) => (
            <label key={tpl} className={`grid cursor-pointer gap-1 rounded-[var(--r-card)] border p-4 ${template === tpl ? "border-ink shadow-[inset_0_0_0_1.5px_var(--ink)]" : "border-line"} bg-surface-raised`}>
              <span className="flex items-center gap-2"><input type="radio" name="template" value={tpl} checked={template === tpl} onChange={() => choose(tpl)} className="size-5 accent-[var(--ink)]" /><span className="font-display text-base">{t(`tpl_${tpl}`)}</span></span>
              <span className="text-sm text-ink-muted">{t(`tplDesc_${tpl}`)}</span>
            </label>
          ))}
        </fieldset>
        <section aria-labelledby="tpl-dims" className="grid min-w-0 flex-[1_1_280px] gap-3 rounded-[var(--r-card)] border border-line bg-surface-raised p-4">
          <h2 id="tpl-dims" className="font-display text-lg">{t("dimensions", { name: t(`tpl_${template}`) })}</h2>
          {ROW_TEMPLATES.has(template) ? (
            <div className="grid grid-cols-2 gap-2">
              {field("rows", t("rows"), 1, 100)}
              {field("seatsFirst", template === "stadium" ? t("stadiumLong") : template === "church" ? t("seatsPerBench") : t("seatsFirst"), 1, 200)}
              {template !== "church" ? field("seatsLast", template === "stadium" ? t("stadiumShort") : t("seatsLast"), 1, 200) : null}
              {template === "theatre" ? field("balconyRows", t("balconyRows"), 0, 30) : null}
            </div>
          ) : null}
          {TABLE_TEMPLATES.has(template) ? (
            <div className="grid grid-cols-2 gap-2">{field("tables", t("tables"), 1, 200)}{field("seatsPerTable", t("seatsPerTable"), 1, 30)}</div>
          ) : null}
          {ROW_TEMPLATES.has(template) ? (
            <>
              {["theatre", "hall", "pit", "conference"].includes(template) ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={o.centerAisle === true} onChange={(e) => setO({ ...o, centerAisle: e.target.checked })} className="size-5 accent-[var(--ink)]" />{t("centerAisle")}</label> : null}
              <div className="grid gap-1">
                <label htmlFor="tpl-num" className="font-label text-sm font-bold">{t("numbering")}</label>
                <Select id="tpl-num" value={o.numbering ?? "ltr"} onChange={(e) => setO({ ...o, numbering: e.target.value as TemplateOptions["numbering"] })}>
                  {["ltr", "rtl", "odd-left", "odd-right"].map((m) => <option key={m} value={m}>{t(`numbering_${m}`)}</option>)}
                </Select>
              </div>
              <div className="grid gap-1">
                <label htmlFor="tpl-rows" className="font-label text-sm font-bold">{t("rowLabels")}</label>
                <Select id="tpl-rows" value={o.rowLabels?.style ?? (template === "stadium" ? "numbers" : "letters")} onChange={(e) => setO({ ...o, rowLabels: e.target.value === "numbers" ? { style: "numbers", start: "1", skip: [] } : { style: "letters", start: "A", skip: ["I", "O"] } })}>
                  <option value="letters">{t("rowLettersSkip")}</option>
                  <option value="numbers">{t("rowNumbers")}</option>
                </Select>
              </div>
              <div className="grid gap-1">
                <label htmlFor="tpl-cats" className="font-label text-sm font-bold">{t("priceCategories")}</label>
                <Select id="tpl-cats" value={String(o.categories ?? 1)} onChange={(e) => setO({ ...o, categories: Number(e.target.value) as 1 | 2 | 3 })}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </div>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || hasSales} onClick={() => onApply(template, o)}>{t("generate")}</Button>
            {canCancel ? <Button type="button" variant="secondary" onClick={onCancel}>{t("cancel")}</Button> : null}
          </div>
          <p className="text-sm text-ink-muted">{t("adjustLater")}</p>
        </section>
      </div>
    </div>
  );
}
