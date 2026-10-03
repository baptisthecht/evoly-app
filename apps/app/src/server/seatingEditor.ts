import "server-only";
import { CoreError, generateBlock, type BlockSpec } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { findEvent } from "./events";
import { seatingMapFor } from "./seating";

/** Section 9.9 : éditeur visuel du plan de salle (blocs, places, catégories). */

const FOCUS_SHAPES = new Set(["stage", "screen", "altar", "pitch"]);
type Kind = BlockSpec["kind"];
export type BlockInput = { id?: string | null; kind: Kind; name: string; x: number; y: number; rotation: number; params: Record<string, unknown> };

/** Plans d'avant les blocs : coordonnées en grille enregistrées, pour l'affichage comme pour les meilleures places. */
async function ensureSeatCoordinates(mapId: string) {
  const rows = await db.seatingRow.findMany({ where: { seatingMapId: mapId, blockId: null }, orderBy: { sortOrder: "asc" }, include: { seats: { orderBy: { sortOrder: "asc" }, select: { id: true, x: true } } } });
  const missing = rows.some((r) => r.seats.some((s) => s.x === null));
  if (missing)
    await db.$transaction(rows.flatMap((r, i) => r.seats.map((s, k) => db.seat.update({ where: { id: s.id }, data: { x: (k - (r.seats.length - 1) / 2) * 30, y: i * 34, angle: 0 } }))));
  const map = await db.seatingMap.findUniqueOrThrow({ where: { id: mapId }, select: { focusX: true } });
  if (map.focusX === null && rows.length) await db.seatingMap.update({ where: { id: mapId }, data: { focusX: 0, focusY: -60 } });
}

export async function seatingEditor(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  const map = await seatingMapFor(ctx, eventId);
  await ensureSeatCoordinates(map.id);
  const [full, ticketTypes] = await Promise.all([
    db.seatingMap.findUniqueOrThrow({
      where: { id: map.id },
      include: {
        categories: { orderBy: { sortOrder: "asc" } },
        blocks: { orderBy: { sortOrder: "asc" } },
        rows: { orderBy: { sortOrder: "asc" }, include: { seats: { orderBy: { sortOrder: "asc" } } } },
      },
    }),
    db.ticketType.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, seatingCategoryId: true } }),
  ]);
  const seats = full.rows.flatMap((r) => r.seats.map((s) => ({ id: s.id, rowId: r.id, row: r.name, blockId: r.blockId, label: s.label, x: s.x ?? 0, y: s.y ?? 0, angle: s.angle, status: s.status, accessible: s.accessible, note: s.note, categoryId: s.categoryId })));
  return {
    mode: event.seatingMode,
    allowChoice: event.allowSeatChoice,
    template: full.template,
    focus: full.focusX !== null && full.focusY !== null ? { x: full.focusX, y: full.focusY } : null,
    categories: full.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, ticketTypeIds: ticketTypes.filter((t) => t.seatingCategoryId === c.id).map((t) => t.id) })),
    ticketTypes: ticketTypes.map((t) => ({ id: t.id, name: t.name, categoryId: t.seatingCategoryId })),
    blocks: full.blocks.map((b) => ({ id: b.id, kind: b.kind as Kind, name: b.name, x: b.x, y: b.y, rotation: b.rotation, params: b.params as Record<string, unknown> })),
    rows: full.rows.map((r) => ({ id: r.id, name: r.name, blockId: r.blockId, categoryId: r.categoryId })),
    seats,
    hasSales: seats.some((s) => s.status === "SOLD" || s.status === "HELD"),
  };
}
export type SeatingEditorState = Awaited<ReturnType<typeof seatingEditor>>;

async function refreshFocus(mapId: string) {
  const shape = (await db.seatingBlock.findMany({ where: { seatingMapId: mapId, kind: "SHAPE" }, orderBy: { sortOrder: "asc" } })).find((b) => FOCUS_SHAPES.has(String((b.params as Record<string, unknown>).shape)));
  if (shape) await db.seatingMap.update({ where: { id: mapId }, data: { focusX: shape.x, focusY: shape.y } });
}

async function defaultCategory(mapId: string) {
  return (await db.seatingCategory.findFirst({ where: { seatingMapId: mapId }, orderBy: { sortOrder: "asc" } })) ?? (await db.seatingCategory.create({ data: { seatingMapId: mapId, name: "Catégorie 1", color: "#FFB8E8", sortOrder: 0 } }));
}

const geometryKey = (b: { kind: string; params: unknown }) => JSON.stringify([b.kind, b.params]);

/**
 * Crée ou modifie un bloc. Déplacement, rotation ou nom : positions recalculées, chaque place conservée (même vendue).
 * Structure (rangs, places, numérotation…) : bloc régénéré en gardant places bloquées, mobilité réduite et notes ;
 * refusé si le bloc contient des places vendues ou retenues.
 */
export async function saveSeatingBlock(ctx: OrgContext, eventId: string, input: BlockInput) {
  const map = await seatingMapFor(ctx, eventId);
  const spec = { kind: input.kind, name: input.name, x: input.x, y: input.y, rotation: input.rotation, params: input.params } as unknown as BlockSpec; // paramètres validés par l'action
  const categoryIds = new Set((await db.seatingCategory.findMany({ where: { seatingMapId: map.id }, select: { id: true } })).map((c) => c.id));
  const fallback = (await defaultCategory(map.id)).id;
  categoryIds.add(fallback);
  const generated = generateBlock(spec);
  const existing = input.id ? await db.seatingBlock.findFirst({ where: { id: input.id, seatingMapId: map.id }, include: { rows: { orderBy: { sortOrder: "asc" }, include: { seats: { orderBy: { sortOrder: "asc" } } } } } }) : null;
  if (input.id && !existing) throw new CoreError("NOT_FOUND");
  const blockId = await db.$transaction(async (tx) => {
    if (existing && geometryKey(existing) === geometryKey(spec)) {
      await tx.seatingBlock.update({ where: { id: existing.id }, data: { name: spec.name, x: spec.x, y: spec.y, rotation: spec.rotation } });
      for (const [i, row] of existing.rows.entries())
        for (const [k, seat] of row.seats.entries()) {
          const g = generated[i]?.seats[k];
          if (g) await tx.seat.update({ where: { id: seat.id }, data: { x: g.x, y: g.y, angle: g.angle } });
        }
      return existing.id;
    }
    const kept = new Map<string, { status: "BLOCKED" | null; accessible: boolean; note: string | null }>();
    if (existing) {
      const seats = existing.rows.flatMap((r) => r.seats.map((s) => ({ ...s, row: r.name })));
      if (seats.some((s) => s.status === "SOLD" || s.status === "HELD")) throw new CoreError("SEATING_BLOCK_HAS_SALES");
      for (const s of seats) kept.set(`${s.row}|${s.label}`, { status: s.status === "BLOCKED" ? "BLOCKED" : null, accessible: s.accessible, note: s.note });
      await tx.seatingRow.deleteMany({ where: { blockId: existing.id } });
    }
    const block = existing
      ? await tx.seatingBlock.update({ where: { id: existing.id }, data: { kind: spec.kind, name: spec.name, x: spec.x, y: spec.y, rotation: spec.rotation, params: spec.params as object } })
      : await tx.seatingBlock.create({ data: { seatingMapId: map.id, kind: spec.kind, name: spec.name, x: spec.x, y: spec.y, rotation: spec.rotation, params: spec.params as object, sortOrder: (await tx.seatingBlock.count({ where: { seatingMapId: map.id } })) } });
    let order = ((await tx.seatingRow.aggregate({ where: { seatingMapId: map.id }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
    for (const r of generated) {
      const categoryId = categoryIds.has(r.category) ? r.category : fallback;
      const row = await tx.seatingRow.create({ data: { seatingMapId: map.id, blockId: block.id, categoryId, name: r.label, sortOrder: order++ } });
      await tx.seat.createMany({
        data: r.seats.map((st) => {
          const k = kept.get(`${r.label}|${st.label}`);
          return { rowId: row.id, categoryId, label: st.label, sortOrder: st.order, x: st.x, y: st.y, angle: st.angle, accessible: k ? k.accessible : st.accessible, note: k?.note ?? null, status: k?.status ?? "AVAILABLE" };
        }),
      });
    }
    return block.id;
  }, { timeout: 60_000 });
  await refreshFocus(map.id);
  await audit({ action: existing ? "seating.block_updated" : "seating.block_created", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "SeatingBlock", targetId: blockId, metadata: { kind: spec.kind } });
  return blockId;
}

export async function deleteSeatingBlock(ctx: OrgContext, eventId: string, blockId: string) {
  const map = await seatingMapFor(ctx, eventId);
  const block = await db.seatingBlock.findFirst({ where: { id: blockId, seatingMapId: map.id } });
  if (!block) throw new CoreError("NOT_FOUND");
  if (await db.seat.count({ where: { row: { blockId }, status: { in: ["SOLD", "HELD"] } } })) throw new CoreError("SEATING_BLOCK_HAS_SALES");
  await db.seatingBlock.delete({ where: { id: blockId } });
  await refreshFocus(map.id);
  await audit({ action: "seating.block_deleted", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "SeatingBlock", targetId: blockId });
}

/** Place : libellé, blocage, mobilité réduite, note interne. Une place vendue ou retenue ne change ni de libellé ni d'état. */
export async function updateSeat(ctx: OrgContext, eventId: string, seatId: string, patch: { label?: string; blocked?: boolean; accessible?: boolean; note?: string | null }) {
  const map = await seatingMapFor(ctx, eventId);
  const seat = await db.seat.findFirst({ where: { id: seatId, row: { seatingMapId: map.id } } });
  if (!seat) throw new CoreError("NOT_FOUND");
  const taken = seat.status === "SOLD" || seat.status === "HELD";
  const label = patch.label?.trim();
  if ((label !== undefined && label !== seat.label) || patch.blocked !== undefined) if (taken) throw new CoreError("SEAT_TAKEN");
  if (label !== undefined && (label.length < 1 || label.length > 12)) throw new CoreError("SEAT_LABEL_INVALID");
  if (label && label !== seat.label && (await db.seat.count({ where: { rowId: seat.rowId, label } }))) throw new CoreError("SEAT_LABEL_TAKEN");
  await db.seat.update({
    where: { id: seat.id },
    data: {
      ...(label ? { label } : {}),
      ...(patch.blocked !== undefined ? { status: patch.blocked ? "BLOCKED" : "AVAILABLE" } : {}),
      ...(patch.accessible !== undefined ? { accessible: patch.accessible } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim().slice(0, 80) || null } : {}),
    },
  });
}

/** Catégorie : nom, couleur et tarifs reliés (un tarif n'est relié qu'à une catégorie). */
export async function updateSeatingCategory(ctx: OrgContext, eventId: string, categoryId: string, input: { name: string; color: string; ticketTypeIds: string[] }) {
  const map = await seatingMapFor(ctx, eventId);
  const cat = await db.seatingCategory.findFirst({ where: { id: categoryId, seatingMapId: map.id } });
  if (!cat) throw new CoreError("NOT_FOUND");
  const name = input.name.trim().slice(0, 40);
  if (name.length < 1 || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new CoreError("SEATING_CATEGORY_INVALID");
  await db.$transaction([
    db.seatingCategory.update({ where: { id: cat.id }, data: { name, color: input.color } }),
    db.ticketType.updateMany({ where: { eventId: map.eventId, seatingCategoryId: cat.id, id: { notIn: input.ticketTypeIds } }, data: { seatingCategoryId: null } }),
    db.ticketType.updateMany({ where: { eventId: map.eventId, id: { in: input.ticketTypeIds } }, data: { seatingCategoryId: cat.id } }),
  ]);
}
