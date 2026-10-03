"use client";

import { bestSeats, createsOrphan, hasOrphanFreeChoice, type PlanSeat } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RowLabels, S, ShapeView, StandingView, Tables, blockBounds } from "@/components/seating/PlanParts";
import type { PublicSeatMap } from "@/server/seating";

type Mode = "best" | "map";

/**
 * Section 9.9 : places de l'acheteur sur le plan. Par défaut, les meilleures places (côte à côte, au plus près de la
 * scène, sans siège isolé) ; sinon, choix sur le plan, limité aux catégories des billets choisis.
 */
export function SeatMapPicker({ map, needed, chosen, friend = null, onChange }: { map: PublicSeatMap; needed: Record<string, number>; chosen: string[]; friend?: { firstName: string; seatIds: string[]; center: { x: number; y: number } } | null; onChange: (ids: string[], valid: boolean) => void }) {
  const t = useTranslations("seatPicker");
  const [mode, setMode] = useState<Mode>("best");
  const seats = useMemo(() => map.rows.flatMap((r) => r.seats.map((s) => ({ ...s, rowId: r.id, row: r.name, blockId: r.blockId }))), [map]);
  const byId = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);
  const colors = useMemo(() => new Map(map.categories.map((c) => [c.id, c.color])), [map.categories]);
  const planFor = (pred: (s: (typeof seats)[number]) => boolean): PlanSeat[] => seats.filter(pred).map((s) => ({ id: s.id, rowId: s.rowId, order: s.order, x: s.x, y: s.y, available: s.available }));
  const neededKey = JSON.stringify(needed);

  const suggestion = useMemo(() => {
    const ids: string[] = [];
    for (const [cat, n] of Object.entries(needed)) {
      // « à côté de mes amis » : au plus près des places de l'ami plutôt que de la scène
      const pick = bestSeats(planFor((s) => s.categoryId === cat), n, friend?.center ?? map.focus);
      if (!pick || pick.length < n) return null;
      ids.push(...pick);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededKey, seats, map.focus, friend]);

  /** Même règle que le serveur : une place laissée seule est refusée si un autre choix l'évite. */
  const orphanFor = (ids: string[]) => {
    if (ids.length === 0) return false;
    const rows = new Set(ids.map((id) => byId.get(id)?.rowId));
    if (!createsOrphan(planFor((s) => rows.has(s.rowId)), ids)) return false;
    return Object.entries(needed).every(([cat, n]) => hasOrphanFreeChoice(planFor((s) => s.categoryId === cat), n));
  };
  const orphan = mode === "map" && orphanFor(chosen);

  // la sélection suit le mode : suggestion en « meilleures places », vierge à l'entrée dans le choix sur le plan
  useEffect(() => {
    if (mode === "best") onChange(suggestion ?? [], !!suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, suggestion]);

  const picked = (cat: string) => chosen.filter((id) => byId.get(id)?.categoryId === cat).length;
  const selectable = (s: (typeof seats)[number]) => mode === "map" && s.available && (chosen.includes(s.id) || (needed[s.categoryId] ?? 0) - picked(s.categoryId) > 0);
  const toggle = (id: string) => {
    const s = byId.get(id);
    if (!s || !selectable(s)) return;
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    onChange(next, !orphanFor(next));
  };
  const describe = (ids: string[]) => {
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const s = byId.get(id);
      if (s) groups.set(s.row, [...(groups.get(s.row) ?? []), s.label]);
    }
    return [...groups].map(([row, labels]) => t("rowSeats", { row, seats: labels.join(", ") })).join(" · ");
  };

  // —— vue : zoom à deux doigts, déplacement à un doigt, boutons ——
  const bounds = useMemo(() => {
    const boxes = [...map.blocks.map((b) => blockBounds(b, seats)), ...seats.filter((s) => !s.blockId).map((s) => ({ x1: s.x - 16, y1: s.y - 16, x2: s.x + 16, y2: s.y + 16 }))];
    if (!boxes.length) return { x: -200, y: -150, w: 400, h: 300 };
    const x1 = Math.min(...boxes.map((b) => b.x1)) - 30, y1 = Math.min(...boxes.map((b) => b.y1)) - 30;
    const x2 = Math.max(...boxes.map((b) => b.x2)) + 30, y2 = Math.max(...boxes.map((b) => b.y2)) + 30;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }, [map.blocks, seats]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const c = center ?? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const vb = { w: bounds.w / zoom, h: bounds.h / zoom };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; c0: { x: number; y: number }; seatId: string | null; moved: boolean; pinch?: { d0: number; z0: number } } | null>(null);
  const clampZoom = (z: number) => Math.min(10, Math.max(1, z));
  const unitsPerPx = () => vb.w / (svgRef.current?.clientWidth || 1);
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { x: e.clientX, y: e.clientY, c0: c, seatId: null, moved: true, pinch: { d0: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, z0: zoom } };
      return;
    }
    gesture.current = { x: e.clientX, y: e.clientY, c0: c, seatId: (e.target as Element).closest("[data-seat]")?.getAttribute("data-seat") ?? null, moved: false };
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom(clampZoom(g.pinch.z0 * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / g.pinch.d0)));
      return;
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    g.moved = true;
    if (zoom > 1) setCenter({ x: g.c0.x - dx * unitsPerPx(), y: g.c0.y - dy * unitsPerPx() });
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (g && !g.moved && g.seatId) toggle(g.seatId);
  };

  const neededCats = Object.entries(needed);
  // vue depuis la place : photo du bloc des places proposées ou choisies
  const viewBlock = map.blocks.find((b) => typeof b.params.viewUrl === "string" && chosen.some((id) => byId.get(id)?.blockId === b.id));
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label={t("modeLabel")} className="grid grid-cols-2 gap-1 rounded-full bg-surface-raised p-1 ring-1 ring-line">
        {(["best", "map"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); if (m === "map") onChange([], true); }} className={`min-h-11 rounded-full px-3 font-label text-sm font-bold ${mode === m ? "bg-surface-inverse text-ink-inverse" : ""}`}>
            {t(m === "best" ? "modeBest" : "modeMap")}
          </button>
        ))}
      </div>
      {mode === "best" ? (
        <p className="text-sm" role="status">{suggestion ? <>{friend ? t("nearFriend", { name: friend.firstName }) : t("bestHint")} <strong>{describe(suggestion)}</strong></> : t("bestNone")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2 text-sm" aria-live="polite">
          {neededCats.map(([cid, n]) => (
            <li key={cid} className="flex items-center gap-2 rounded-full px-3 py-1 ring-1 ring-line">
              <span className="size-3 rounded-full" style={{ background: colors.get(cid) }} aria-hidden="true" />
              {t("remaining", { name: map.categories.find((x) => x.id === cid)?.name ?? "", count: n - picked(cid) })}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <button type="button" aria-label={t("zoomOut")} onClick={() => setZoom((z) => clampZoom(z / 1.4))} className="grid size-11 place-items-center rounded-full font-bold ring-1 ring-line-strong">−</button>
        <button type="button" aria-label={t("zoomIn")} onClick={() => setZoom((z) => clampZoom(z * 1.4))} className="grid size-11 place-items-center rounded-full font-bold ring-1 ring-line-strong">+</button>
        <button type="button" onClick={() => { setZoom(1); setCenter(null); }} className="min-h-11 whitespace-nowrap rounded-full px-4 text-sm font-semibold">{t("fit")}</button>
        <span className="text-xs text-ink-muted">{t("pinch")}</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${c.x - vb.w / 2} ${c.y - vb.h / 2} ${vb.w} ${vb.h}`}
        role="group"
        aria-label={t("map")}
        className="aspect-[4/3] max-h-[70vh] w-full touch-none select-none rounded-[var(--r-card)] bg-surface-sunken"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); gesture.current = null; }}
      >
        <g aria-hidden="true">
          {map.blocks.map((b) =>
            b.kind === "SHAPE" ? <ShapeView key={b.id} block={b} /> : b.kind === "STANDING" ? <StandingView key={b.id} block={b} color={colors.get(S(b, "category")) ?? "#FFB8E8"} /> : b.kind === "TABLE_ROUND" || b.kind === "TABLE_RECT" ? <Tables key={b.id} block={b} seats={seats} rows={map.rows} /> : b.kind === "ROWS" ? <RowLabels key={b.id} seats={seats.filter((s) => s.blockId === b.id)} rows={map.rows.filter((r) => r.blockId === b.id)} /> : null,
          )}
          {!map.blocks.length ? <RowLabels seats={seats} rows={map.rows} /> : null}
        </g>
        {seats.map((s) => {
          const mine = chosen.includes(s.id);
          const can = selectable(s);
          const ours = (needed[s.categoryId] ?? 0) > 0;
          const friendSeat = friend?.seatIds.includes(s.id) ?? false;
          const fill = mine ? "#222222" : friendSeat ? "#FFB8E8" : !s.available ? "#D3CCC7" : colors.get(s.categoryId) ?? "#D9B8F0";
          return (
            <g
              key={s.id}
              data-seat={s.id}
              transform={`translate(${s.x} ${s.y}) rotate(${s.angle})`}
              {...(can ? { role: "button", tabIndex: 0, "aria-pressed": mine, "aria-label": t("seat", { row: s.row, seat: s.label, state: mine ? t("selected") : t("free") }), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(s.id); } } } : { "aria-hidden": true })}
              opacity={mine || friendSeat || !s.available || ours ? 1 : 0.35}
              style={{ cursor: can ? "pointer" : "default", outline: "none" }}
              className="focus-visible:[&>rect]:stroke-[#3B5BDB] focus-visible:[&>rect]:[stroke-width:3px]"
            >
              <rect x={-11} y={-9.5} width={22} height={19} rx={5} fill={fill} stroke={mine ? "#FFB8E8" : friendSeat ? "#222222" : "none"} strokeWidth={2} />
              {friendSeat ? <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#222222" style={{ pointerEvents: "none" }}>{friend!.firstName.charAt(0).toUpperCase()}</text> : null}
              {mine ? <path d="M-5 0 l3.5 3.5 l6 -7" fill="none" stroke="#FFF6F0" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /> : s.accessible ? <circle r={4.5} fill="#FFFFFF" stroke="#222222" strokeWidth={1.5} /> : null}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label={t("legend")}>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-[#222222]" aria-hidden="true" />{t("legendSelected")}</li>
        {friend ? <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm border-[1.5px] border-[#222222] bg-[#FFB8E8]" aria-hidden="true" />{t("legendFriend", { name: friend.firstName })}</li> : null}
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-[#D3CCC7]" aria-hidden="true" />{t("legendTaken")}</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full border-[1.5px] border-[#222222] bg-white" aria-hidden="true" />{t("legendAccessible")}</li>
      </ul>
      {mode === "map" && orphan ? <p role="alert" className="text-sm font-semibold text-danger">{t("orphan")}</p> : null}
      {viewBlock ? (
        <>
          <button type="button" onClick={() => dialogRef.current?.showModal()} className="min-h-11 justify-self-start rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong">{t("viewOpen")}</button>
          <dialog ref={dialogRef} aria-label={t("viewTitle", { name: viewBlock.name })} className="w-[min(100%-2rem,48rem)] rounded-[var(--r-card)] p-0 backdrop:bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) dialogRef.current?.close(); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewBlock.params.viewUrl as string} alt={t("viewTitle", { name: viewBlock.name })} className="block h-auto w-full" />
            <form method="dialog" className="flex justify-end p-3"><button className="min-h-11 rounded-full bg-surface-inverse px-5 text-sm font-semibold text-ink-inverse">{t("viewClose")}</button></form>
          </dialog>
        </>
      ) : null}
    </div>
  );
}
