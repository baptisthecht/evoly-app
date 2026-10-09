"use client";

import { PALETTE } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { RowLabels, S, ShapeView, StandingView, Tables, blockBounds } from "@/components/seating/PlanParts";
import type { SeatOccupancy } from "@/server/seatingEditor";

const FILL = { FREE: PALETTE.blanc, BLOCKED: PALETTE.seatBlocked, HELD: PALETTE.seatHeld, SOLD: PALETTE.charbon, IN: PALETTE.seatIn } as const;

/** Section 9.9 : plan d'occupation pour l'accueil, rafraîchi pendant le contrôle et imprimable avec la liste des places. */
export function OccupancyPlan({ data }: { data: SeatOccupancy }) {
  const t = useTranslations("occupancy");
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [router]);
  const colors = new Map(data.categories.map((c) => [c.id, c.color]));
  const box = useMemo(() => {
    const b = [
      ...data.blocks.map((x) => blockBounds(x, data.seats)),
      ...data.seats.filter((s) => !s.blockId).map((s) => ({ x1: s.x - 16, y1: s.y - 16, x2: s.x + 16, y2: s.y + 16 })),
    ];
    const x1 = Math.min(...b.map((v) => v.x1)) - 30,
      y1 = Math.min(...b.map((v) => v.y1)) - 30;
    return `${x1} ${y1} ${Math.max(...b.map((v) => v.x2)) + 30 - x1} ${Math.max(...b.map((v) => v.y2)) + 30 - y1}`;
  }, [data]);
  const occupied = data.seats.filter((s) => s.holder);
  const byRow = new Map<string, typeof occupied>();
  for (const s of occupied) byRow.set(s.row, [...(byRow.get(s.row) ?? []), s]);
  return (
    <section aria-labelledby="occ-title" className="grid gap-3 rounded-[var(--r-card)] border border-line bg-surface-raised p-5 print:border-0 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="occ-title" className="font-display text-xl tracking-[var(--tracking-title)]">
          {t("title")}
        </h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 rounded-full px-4 font-label text-sm font-bold ring-1 ring-line-strong print:hidden"
        >
          {t("print")}
        </button>
      </div>
      <p className="text-sm" role="status">
        {t("counts", { entered: data.counts.entered, sold: data.counts.sold, free: data.counts.free, blocked: data.counts.blocked })}
      </p>
      <svg
        viewBox={box}
        role="img"
        aria-label={t("planLabel", { entered: data.counts.entered, sold: data.counts.sold })}
        className="h-auto max-h-[70vh] w-full rounded-md bg-surface-sunken print:max-h-none"
      >
        {data.blocks.map((b) =>
          b.kind === "SHAPE" ? (
            <ShapeView key={b.id} block={b} />
          ) : b.kind === "STANDING" ? (
            <StandingView key={b.id} block={b} color={colors.get(S(b, "category")) ?? PALETTE.rose} />
          ) : b.kind === "TABLE_ROUND" || b.kind === "TABLE_RECT" ? (
            <Tables key={b.id} block={b} seats={data.seats} rows={data.rows} />
          ) : (
            <RowLabels key={b.id} seats={data.seats.filter((s) => s.blockId === b.id)} rows={data.rows.filter((r) => r.blockId === b.id)} />
          ),
        )}
        {data.seats.map((s) => (
          <g key={s.id} transform={`translate(${s.x} ${s.y}) rotate(${s.angle})`}>
            <rect
              x={-11}
              y={-9.5}
              width={22}
              height={19}
              rx={5}
              fill={FILL[s.state]}
              stroke={s.state === "FREE" ? (colors.get(s.categoryId) ?? PALETTE.seatOutline) : "none"}
              strokeWidth={2}
            />
            {s.accessible && s.state === "FREE" ? <circle r={4} fill="none" stroke={PALETTE.charbon} strokeWidth={1.5} /> : null}
          </g>
        ))}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label={t("legend")}>
        {(["IN", "SOLD", "HELD", "FREE", "BLOCKED"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm ring-1 ring-line-strong" style={{ background: FILL[k] }} aria-hidden="true" />
            {t(`state_${k}`)}
          </li>
        ))}
      </ul>
      <details className="print:block" open={false}>
        <summary className="cursor-pointer font-label text-sm font-bold print:hidden">{t("list", { count: occupied.length })}</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3">
                {t("row")}
              </th>
              <th scope="col" className="py-1 pr-3">
                {t("seat")}
              </th>
              <th scope="col" className="py-1 pr-3">
                {t("holder")}
              </th>
              <th scope="col" className="py-1">
                {t("status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...byRow].flatMap(([row, seats]) =>
              seats.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-1 pr-3">{row}</td>
                  <td className="py-1 pr-3">{s.label}</td>
                  <td className="py-1 pr-3">{s.holder}</td>
                  <td className="py-1">{t(`state_${s.state}`)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </details>
    </section>
  );
}
