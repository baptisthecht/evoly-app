"use client";

import { inkOn, palette } from "@evoly/ui";

import { useTranslations } from "next-intl";
import type { PublicSeatMap } from "@/server/seating";

/** Section 9.9 : choix des places sur le plan (catégories des billets choisis uniquement, places libres). */
export function SeatPicker({ map, needed, chosen, onToggle }: { map: PublicSeatMap; needed: Record<string, number>; chosen: string[]; onToggle: (seatId: string) => void }) {
  const t = useTranslations("seatPicker");
  const color = (id: string) => map.categories.find((c) => c.id === id)?.color ?? palette.rose;
  const picked = (categoryId: string) => map.rows.flatMap((r) => r.seats).filter((s) => s.categoryId === categoryId && chosen.includes(s.id)).length;
  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-2 text-sm">
        {Object.entries(needed).map(([cid, n]) => (
          <li key={cid} className="flex items-center gap-2 rounded-full px-3 py-1 ring-1 ring-line">
            <span className="size-3 rounded-full" style={{ background: color(cid) }} aria-hidden="true" />
            {t("remaining", { name: map.categories.find((c) => c.id === cid)?.name ?? "", count: n - picked(cid) })}
          </li>
        ))}
      </ul>
      <div className="grid gap-1.5 overflow-x-auto rounded-md bg-surface-sunken p-3" role="group" aria-label={t("map")}>
        <p className="mx-auto mb-1 w-2/3 rounded bg-surface-inverse py-1 text-center text-xs font-semibold text-ink-inverse">{t("stage")}</p>
        {map.rows.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5">
            <span className="w-7 shrink-0 text-right text-xs font-bold">{r.name}</span>
            <div className="flex flex-nowrap gap-1">
              {r.seats.map((s) => {
                const mine = chosen.includes(s.id);
                const selectable = s.available && (mine || (needed[s.categoryId] ?? 0) - picked(s.categoryId) > 0);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={mine}
                    disabled={!selectable}
                    onClick={() => onToggle(s.id)}
                    aria-label={t("seat", { row: r.name, seat: s.label, state: mine ? t("selected") : s.available ? t("free") : t("taken") })}
                    className={`grid size-8 place-items-center rounded-md text-[0.65rem] font-bold ${mine ? "ring-2 ring-[var(--ink)] ring-offset-1" : ""}`}
                    style={mine ? { background: "var(--surface-inverse)", color: "var(--ink-inverse)" } : s.available && needed[s.categoryId] ? { background: color(s.categoryId), color: inkOn(color(s.categoryId)) } : { background: "var(--surface-sunken)", color: "var(--ink-subtle)" }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
