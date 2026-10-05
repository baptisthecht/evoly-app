import "server-only";
import { CoreError, generateBlock, type BlockSpec } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { applyPlan, seatingMapFor, type SeatOverride, type StoredPlan } from "./seating";

/**
 * Bibliothèque de salles (section 9.9) : le plan d'un événement enregistré comme salle réutilisable (blocs,
 * catégories, places particulières), éventuellement partagé avec les autres organisateurs qui jouent dans la même salle.
 */
export async function saveSeatingLayout(ctx: OrgContext, eventId: string, input: { name: string; city: string | null; shared: boolean }) {
  const map = await seatingMapFor(ctx, eventId);
  const full = await db.seatingMap.findUniqueOrThrow({
    where: { id: map.id },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      blocks: { orderBy: { sortOrder: "asc" }, include: { rows: { orderBy: { sortOrder: "asc" }, include: { seats: { orderBy: { sortOrder: "asc" } } } } } },
    },
  });
  if (!full.blocks.length) throw new CoreError("SEATING_LAYOUT_EMPTY");
  const keyOf = new Map(full.categories.map((c, i) => [c.id, `k${i}`]));
  const toKeys = (params: Record<string, unknown>) => {
    const p = { ...params };
    if (Array.isArray(p.categories)) p.categories = (p.categories as string[]).map((id) => keyOf.get(id) ?? "k0");
    if (typeof p.category === "string") p.category = keyOf.get(p.category) ?? "k0";
    return p;
  };
  const overrides: SeatOverride[] = [];
  const blocks = full.blocks.map((b, bi) => {
    const spec = {
      kind: b.kind,
      name: b.name,
      x: b.x,
      y: b.y,
      rotation: b.rotation,
      params: toKeys(b.params as Record<string, unknown>),
    } as unknown as BlockSpec;
    const generated = generateBlock(spec);
    b.rows.forEach((row, ri) =>
      row.seats.forEach((seat) => {
        const g = generated[ri]?.seats.find((x) => x.order === seat.sortOrder);
        const o: SeatOverride = { block: bi, row: ri, order: seat.sortOrder };
        if (g && seat.label !== g.label) o.label = seat.label;
        if (g && seat.accessible !== g.accessible) o.accessible = seat.accessible;
        if (seat.status === "BLOCKED") o.blocked = true;
        if (seat.note) o.note = seat.note;
        if (Object.keys(o).length > 3) overrides.push(o);
      }),
    );
    return spec;
  });
  const plan: StoredPlan = {
    categories: full.categories.map((c, i) => ({ key: `k${i}`, name: c.name, color: c.color })),
    blocks,
    focus: { x: full.focusX ?? 0, y: full.focusY ?? -60 },
    overrides,
  };
  const seatCount = full.blocks.reduce((n, b) => n + b.rows.reduce((m, r) => m + r.seats.length, 0), 0);
  const layout = await db.seatingLayout.create({
    data: {
      organizationId: ctx.organization.id,
      name: input.name.trim().slice(0, 60),
      city: input.city?.trim().slice(0, 60) || null,
      shared: input.shared,
      plan: plan as object,
      seatCount,
    },
  });
  await audit({
    action: "seating.layout_saved",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "SeatingLayout",
    targetId: layout.id,
    metadata: { shared: input.shared },
  });
  return layout.id;
}

/** Salles de l'organisation et salles partagées par les autres organisateurs (recherche par nom ou ville). */
export async function listSeatingLayouts(ctx: OrgContext, query = "") {
  const q = query.trim().slice(0, 60);
  const search = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { city: { contains: q, mode: "insensitive" as const } }] } : {};
  const rows = await db.seatingLayout.findMany({
    where: { AND: [{ OR: [{ organizationId: ctx.organization.id }, { shared: true }] }, search] },
    orderBy: [{ updatedAt: "desc" }],
    take: 30,
    select: { id: true, name: true, city: true, seatCount: true, shared: true, organizationId: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, city: r.city, seatCount: r.seatCount, shared: r.shared, mine: r.organizationId === ctx.organization.id }));
}
export type SeatingLayoutItem = Awaited<ReturnType<typeof listSeatingLayouts>>[number];

export async function applySeatingLayout(ctx: OrgContext, eventId: string, layoutId: string) {
  const layout = await db.seatingLayout.findFirst({ where: { id: layoutId, OR: [{ organizationId: ctx.organization.id }, { shared: true }] } });
  if (!layout) throw new CoreError("NOT_FOUND");
  return applyPlan(ctx, eventId, layout.plan as unknown as StoredPlan, `layout:${layout.id}`);
}

export async function deleteSeatingLayout(ctx: OrgContext, layoutId: string) {
  const done = await db.seatingLayout.deleteMany({ where: { id: layoutId, organizationId: ctx.organization.id } });
  if (!done.count) throw new CoreError("NOT_FOUND");
}
