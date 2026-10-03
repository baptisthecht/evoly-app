/** Dessin du plan de salle partagé par l'éditeur et l'acheteur : formes, zones debout, tables, noms des rangs. */

export type PlanBlock = { id: string; kind: string; x: number; y: number; rotation: number; params: Record<string, unknown> };
export type PlanSeatPos = { id: string; rowId: string; x: number; y: number };
export type PlanRow = { id: string; name: string; blockId: string | null };

export const P = (b: { params: Record<string, unknown> }, key: string, fallback: number) => (typeof b.params[key] === "number" ? (b.params[key] as number) : fallback);
export const S = (b: { params: Record<string, unknown> }, key: string, fallback = "") => (typeof b.params[key] === "string" ? (b.params[key] as string) : fallback);
export const SHAPE_FILL: Record<string, string> = { stage: "#222222", screen: "#4A4441", pitch: "#2F7A4F", altar: "#8A6D3B", bar: "#E5D8CF", entrance: "transparent", label: "transparent" };
export const SHAPE_TEXT: Record<string, string> = { stage: "#FFF6F0", screen: "#FFF6F0", pitch: "#FFFFFF", altar: "#FFF6F0", bar: "#222222", entrance: "#5C5552", label: "#222222" };

export function blockBounds(b: PlanBlock, seats: ReadonlyArray<PlanSeatPos & { blockId?: string | null }>) {
  if (b.kind === "SHAPE" || b.kind === "STANDING") {
    const w = P(b, "width", 100) / 2, h = P(b, "height", 40) / 2;
    const r = (b.rotation * Math.PI) / 180;
    const ex = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r)), ey = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
    return { x1: b.x - ex, y1: b.y - ey, x2: b.x + ex, y2: b.y + ey };
  }
  const own = seats.filter((s) => s.blockId === b.id);
  if (!own.length) return { x1: b.x - 20, y1: b.y - 20, x2: b.x + 20, y2: b.y + 20 };
  return { x1: Math.min(...own.map((s) => s.x)) - 16, y1: Math.min(...own.map((s) => s.y)) - 16, x2: Math.max(...own.map((s) => s.x)) + 16, y2: Math.max(...own.map((s) => s.y)) + 16 };
}

export function ShapeView({ block }: { block: PlanBlock }) {
  const shape = S(block, "shape", "stage");
  const w = P(block, "width", 200), h = P(block, "height", 40);
  return (
    <g transform={`translate(${block.x} ${block.y}) rotate(${block.rotation})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={shape === "pitch" ? 6 : 12} fill={SHAPE_FILL[shape]} stroke={shape === "entrance" || shape === "label" ? "#9A918C" : "none"} strokeDasharray={shape === "entrance" ? "6 4" : undefined} strokeWidth={1.5} />
      {shape === "pitch" ? (
        <g fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={0.85} style={{ pointerEvents: "none" }}>
          <rect x={-w / 2 + 14} y={-h / 2 + 14} width={w - 28} height={h - 28} />
          <line x1={0} y1={-h / 2 + 14} x2={0} y2={h / 2 - 14} />
          <circle r={Math.min(w, h) * 0.13} />
          <rect x={-w / 2 + 14} y={-h * 0.22} width={w * 0.12} height={h * 0.44} />
          <rect x={w / 2 - 14 - w * 0.12} y={-h * 0.22} width={w * 0.12} height={h * 0.44} />
        </g>
      ) : null}
      <text y={5} textAnchor="middle" fontSize={Math.min(18, h * 0.5)} fontWeight={800} letterSpacing={2} fill={SHAPE_TEXT[shape]} style={{ pointerEvents: "none" }}>{S(block, "label")}</text>
    </g>
  );
}

export function StandingView({ block, color }: { block: PlanBlock; color: string }) {
  const w = P(block, "width", 300), h = P(block, "height", 160);
  return (
    <g transform={`translate(${block.x} ${block.y}) rotate(${block.rotation})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={14} fill={color} fillOpacity={0.35} stroke="#5C5552" strokeWidth={1.5} strokeDasharray="8 5" />
      <text y={-2} textAnchor="middle" fontSize={15} fontWeight={800} fill="#222222" style={{ pointerEvents: "none" }}>{S(block, "label")}</text>
      <text y={18} textAnchor="middle" fontSize={12} fill="#5C5552" style={{ pointerEvents: "none" }}>{P(block, "capacity", 0)}</text>
    </g>
  );
}

export function Tables({ block, seats, rows }: { block: PlanBlock; seats: ReadonlyArray<PlanSeatPos>; rows: ReadonlyArray<PlanRow> }) {
  return (
    <g>
      {rows.filter((r) => r.blockId === block.id).map((r) => {
        const own = seats.filter((s) => s.rowId === r.id);
        if (!own.length) return null;
        const cx = own.reduce((a, s) => a + s.x, 0) / own.length, cy = own.reduce((a, s) => a + s.y, 0) / own.length;
        const shape = block.kind === "TABLE_ROUND"
          ? <circle cx={cx} cy={cy} r={Math.max(12, own.reduce((a, s) => a + Math.hypot(s.x - cx, s.y - cy), 0) / own.length - 16)} fill="#F1E7E1" stroke="#D8CBC2" />
          : (() => {
              const xs = own.map((s) => s.x), ys = own.map((s) => s.y);
              return <rect x={Math.min(...xs) + 4} y={Math.min(...ys) + 14} width={Math.max(10, Math.max(...xs) - Math.min(...xs) - 8)} height={Math.max(10, Math.max(...ys) - Math.min(...ys) - 28)} rx={6} fill="#F1E7E1" stroke="#D8CBC2" />;
            })();
        return (
          <g key={r.id}>
            {shape}
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#5C5552" style={{ pointerEvents: "none" }}>{r.name}</text>
          </g>
        );
      })}
    </g>
  );
}

export function RowLabels({ seats, rows }: { seats: ReadonlyArray<PlanSeatPos>; rows: ReadonlyArray<PlanRow> }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {rows.map((r) => {
        const own = seats.filter((s) => s.rowId === r.id);
        if (own.length < 2) return null;
        const [a, b] = [own[0]!, own[1]!];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        const z = own[own.length - 1]!, y = own[own.length - 2]!;
        const len2 = Math.hypot(z.x - y.x, z.y - y.y) || 1;
        return (
          <g key={r.id} fontSize={11} fontWeight={700} fill="#5C5552">
            <text x={a.x - ux * 22} y={a.y - uy * 22 + 4} textAnchor="middle">{r.name}</text>
            <text x={z.x + ((z.x - y.x) / len2) * 22} y={z.y + ((z.y - y.y) / len2) * 22 + 4} textAnchor="middle">{r.name}</text>
          </g>
        );
      })}
    </g>
  );
}
