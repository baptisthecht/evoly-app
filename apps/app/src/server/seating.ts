import "server-only";
import { CoreError, bestSeats, createsOrphan, generateBlock, hasFeature, hasOrphanFreeChoice, pickSeats, seatLabels, seatingTemplate, type PlanSeat, type SeatingTemplate, type TemplateOptions } from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { findEvent } from "./events";

type Tx = Prisma.TransactionClient;

async function mapFor(ctx: OrgContext, eventId: string) {
  if (!hasFeature(ctx.features, "SEATING_MAPS")) throw new CoreError("PRO_REQUIRED");
  const event = await findEvent(ctx, eventId);
  return db.seatingMap.upsert({ where: { eventId: event.id }, create: { eventId: event.id }, update: {} });
}

/** Section 9.9 : plan de salle de l'événement (catégories, rangs, sièges et leur état). */
export async function seatingOverview(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  const map = await db.seatingMap.findUnique({ where: { eventId: event.id }, include: { categories: { orderBy: { sortOrder: "asc" }, include: { ticketTypes: { select: { id: true, name: true } } } }, rows: { orderBy: { sortOrder: "asc" }, include: { seats: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, status: true } } } } } });
  return { mode: event.seatingMode, allowChoice: event.allowSeatChoice, map };
}

export async function saveCategory(ctx: OrgContext, eventId: string, input: { name: string; color: string; ticketTypeId: string | null }) {
  const map = await mapFor(ctx, eventId);
  const name = input.name.trim().slice(0, 40);
  if (name.length < 1 || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new CoreError("SEATING_CATEGORY_INVALID");
  const count = await db.seatingCategory.count({ where: { seatingMapId: map.id } });
  const cat = await db.seatingCategory.create({ data: { seatingMapId: map.id, name, color: input.color, sortOrder: count + 1 } });
  if (input.ticketTypeId) await db.ticketType.updateMany({ where: { id: input.ticketTypeId, eventId }, data: { seatingCategoryId: cat.id } });
  return cat;
}

/** Rang : libellés automatiques (« 12 ») ou manuels (« 1, 2, 2 bis »). */
export async function addRow(ctx: OrgContext, eventId: string, input: { categoryId: string; name: string; seats: string }) {
  const map = await mapFor(ctx, eventId);
  const labels = seatLabels(input.seats);
  const name = input.name.trim().slice(0, 20);
  if (!labels || !name) throw new CoreError("SEATING_ROW_INVALID");
  const cat = await db.seatingCategory.findFirst({ where: { id: input.categoryId, seatingMapId: map.id } });
  if (!cat) throw new CoreError("NOT_FOUND");
  const order = (await db.seatingRow.aggregate({ where: { seatingMapId: map.id }, _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  const row = await db.seatingRow.create({ data: { seatingMapId: map.id, categoryId: cat.id, name, sortOrder: order + 1, seats: { create: labels.map((label, i) => ({ label, categoryId: cat.id, sortOrder: i + 1 })) } } });
  await audit({ action: "seating.row_added", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Event", targetId: eventId, metadata: { row: name, seats: labels.length } });
  return row;
}

/** RG-SEAT-02 : un rang avec des sièges vendus (ou retenus par un panier) ne peut pas être supprimé. */
export async function deleteRow(ctx: OrgContext, eventId: string, rowId: string) {
  const map = await mapFor(ctx, eventId);
  const row = await db.seatingRow.findFirst({ where: { id: rowId, seatingMapId: map.id }, include: { seats: { select: { status: true } } } });
  if (!row) throw new CoreError("NOT_FOUND");
  if (row.seats.some((s) => s.status === "SOLD" || s.status === "HELD")) throw new CoreError("SEATING_ROW_SOLD");
  await db.seatingRow.delete({ where: { id: row.id } });
}

/** Siège bloqué ou débloqué ; jamais un siège vendu ou retenu (RG-SEAT-02). */
export async function toggleSeatBlocked(ctx: OrgContext, eventId: string, seatId: string) {
  const map = await mapFor(ctx, eventId);
  const seat = await db.seat.findFirst({ where: { id: seatId, row: { seatingMapId: map.id } } });
  if (!seat || (seat.status !== "AVAILABLE" && seat.status !== "BLOCKED")) throw new CoreError("SEAT_NOT_EDITABLE");
  await db.seat.update({ where: { id: seat.id }, data: { status: seat.status === "BLOCKED" ? "AVAILABLE" : "BLOCKED" } });
}

/** Placement numéroté activé seulement si chaque tarif en vente a une catégorie avec des sièges. */
export async function setSeatingMode(ctx: OrgContext, eventId: string, assigned: boolean) {
  if (!hasFeature(ctx.features, "SEATING_MAPS")) throw new CoreError("PRO_REQUIRED");
  const event = await findEvent(ctx, eventId);
  if (assigned) {
    const types = await db.ticketType.findMany({ where: { eventId: event.id, status: { not: "ARCHIVED" } }, select: { seatingCategoryId: true } });
    if (types.length === 0 || types.some((t) => !t.seatingCategoryId)) throw new CoreError("SEATING_TYPES_UNMAPPED");
  }
  // le choix des places n'est remis à « non » qu'à la désactivation (sinon il écraserait un choix fait juste après)
  await db.event.update({ where: { id: event.id }, data: { seatingMode: assigned ? "ASSIGNED" : "GENERAL_ADMISSION", ...(assigned ? {} : { allowSeatChoice: false }) } });
}

/** Choix du siège par l'acheteur (sinon attribution automatique). */
export async function setSeatChoice(ctx: OrgContext, eventId: string, allow: boolean) {
  if (!hasFeature(ctx.features, "SEATING_MAPS")) throw new CoreError("PRO_REQUIRED");
  const event = await findEvent(ctx, eventId);
  await db.event.update({ where: { id: event.id }, data: { allowSeatChoice: allow } });
}

/** Plan public : disponibilités lues en direct (jamais mises en cache), catégories et leurs tarifs. */
export async function publicSeatMap(eventId: string) {
  const map = await db.seatingMap.findUnique({ where: { eventId }, include: { categories: { orderBy: { sortOrder: "asc" }, include: { ticketTypes: { select: { id: true } } } }, rows: { orderBy: { sortOrder: "asc" }, include: { seats: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, status: true, categoryId: true } } } } } });
  if (!map) return null;
  return {
    categories: map.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, ticketTypeIds: c.ticketTypes.map((t) => t.id) })),
    rows: map.rows.map((r) => ({ id: r.id, name: r.name, seats: r.seats.map((s) => ({ id: s.id, label: s.label, categoryId: s.categoryId, available: s.status === "AVAILABLE" })) })),
  };
}
export type PublicSeatMap = NonNullable<Awaited<ReturnType<typeof publicSeatMap>>>;

// —— réservation (appelé sous le verrou de l'événement) ——

/**
 * RG-SEAT-01 : sièges retenus avec le panier, jusqu'à son expiration. Places choisies par l'acheteur : nombre exact
 * par catégorie, chacune libre et dans la bonne catégorie (revérifié ici, sous le verrou de l'événement) ;
 * sinon, meilleures places attribuées automatiquement.
 */
export async function holdSeats(tx: Tx, orderId: string, lines: ReadonlyArray<{ ticketTypeId: string; quantity: number }>, types: ReadonlyArray<{ id: string; seatingCategoryId: string | null }>, until: Date, chosen?: readonly string[] | null) {
  const perCategory = new Map<string, number>();
  for (const l of lines) {
    const cat = types.find((t) => t.id === l.ticketTypeId)?.seatingCategoryId;
    if (!cat) throw new CoreError("SEATING_TYPES_UNMAPPED");
    perCategory.set(cat, (perCategory.get(cat) ?? 0) + l.quantity);
  }
  if (chosen && chosen.length) {
    const picked = await tx.seat.findMany({ where: { id: { in: [...new Set(chosen)] } }, select: { id: true, categoryId: true, status: true } });
    const byCat = new Map<string, number>();
    for (const s of picked) byCat.set(s.categoryId, (byCat.get(s.categoryId) ?? 0) + 1);
    const matches = picked.length === chosen.length && [...perCategory].every(([c, n]) => byCat.get(c) === n) && byCat.size === perCategory.size;
    if (!matches) throw new CoreError("SEATS_MISMATCH");
    await refuseOrphans(tx, picked.map((s) => s.id), perCategory);
    const held = await tx.seat.updateMany({ where: { id: { in: picked.map((s) => s.id) }, status: "AVAILABLE" }, data: { status: "HELD", holdOrderId: orderId, holdExpiresAt: until } });
    if (held.count !== picked.length) throw new CoreError("SEAT_TAKEN");
    return;
  }
  for (const [categoryId, n] of perCategory) {
    const seats = await tx.seat.findMany({ where: { categoryId }, select: { id: true, rowId: true, sortOrder: true, status: true, x: true, y: true, row: { select: { sortOrder: true } } } });
    const focus = (await tx.seatingCategory.findUnique({ where: { id: categoryId }, select: { seatingMap: { select: { focusX: true, focusY: true } } } }))?.seatingMap;
    const placed = seats.every((s) => s.x !== null && s.y !== null) && focus?.focusX != null && focus.focusY != null;
    const ids = placed
      ? bestSeats(seats.map((s) => ({ id: s.id, rowId: s.rowId, order: s.sortOrder, x: s.x!, y: s.y!, available: s.status === "AVAILABLE" })), n, { x: focus!.focusX!, y: focus!.focusY! })
      : pickSeats(seats.map((s) => ({ id: s.id, rowOrder: s.row.sortOrder, seatOrder: s.sortOrder, available: s.status === "AVAILABLE" })), n);
    if (!ids) throw new CoreError("NOT_ENOUGH_SEATS");
    const held = await tx.seat.updateMany({ where: { id: { in: ids }, status: "AVAILABLE" }, data: { status: "HELD", holdOrderId: orderId, holdExpiresAt: until } });
    if (held.count !== ids.length) throw new CoreError("NOT_ENOUGH_SEATS");
  }
}

export async function releaseSeats(tx: Tx, orderId: string) {
  await tx.seat.updateMany({ where: { holdOrderId: orderId, status: "HELD" }, data: { status: "AVAILABLE", holdOrderId: null, holdExpiresAt: null } });
}

/** Paiement validé : un siège retenu par billet, dans l'ordre du plan, puis vendus. */
export async function seatsForTickets(tx: Tx, orderId: string) {
  const seats = await tx.seat.findMany({ where: { holdOrderId: orderId, status: "HELD" }, select: { id: true, categoryId: true, sortOrder: true, row: { select: { sortOrder: true } } } });
  const byCategory = new Map<string, string[]>();
  for (const s of seats.sort((a, b) => a.row.sortOrder - b.row.sortOrder || a.sortOrder - b.sortOrder)) byCategory.set(s.categoryId, [...(byCategory.get(s.categoryId) ?? []), s.id]);
  return byCategory;
}

export async function markSeatsSold(tx: Tx, orderId: string) {
  await tx.seat.updateMany({ where: { holdOrderId: orderId, status: "HELD" }, data: { status: "SOLD", holdExpiresAt: null } });
}

/** Places d'un ensemble de rangs pour la règle des sièges isolés (coordonnées, ou position dans le rang à défaut). */
async function planSeats(tx: Tx, where: { rowId?: { in: string[] }; categoryId?: string }): Promise<PlanSeat[]> {
  const seats = await tx.seat.findMany({ where, select: { id: true, rowId: true, sortOrder: true, status: true, x: true, y: true, row: { select: { sortOrder: true } } } });
  return seats.map((s) => ({ id: s.id, rowId: s.rowId, order: s.sortOrder, x: s.x ?? s.sortOrder * 30, y: s.y ?? s.row.sortOrder * 34, available: s.status === "AVAILABLE" }));
}

/** Refuse un choix qui laisse une place seule, si un choix côte à côte sans place isolée existe pour chaque catégorie. */
async function refuseOrphans(tx: Tx, chosen: string[], perCategory: Map<string, number>) {
  const rows = await tx.seat.findMany({ where: { id: { in: chosen } }, select: { rowId: true } });
  if (!createsOrphan(await planSeats(tx, { rowId: { in: [...new Set(rows.map((r) => r.rowId))] } }), chosen)) return;
  for (const [categoryId, n] of perCategory) if (!hasOrphanFreeChoice(await planSeats(tx, { categoryId }), n)) return;
  throw new CoreError("SEAT_ORPHAN");
}

/**
 * Plan de départ d'après un modèle (théâtre, stade…) : catégories, blocs, rangs et places avec leurs coordonnées.
 * Refusé dès qu'une place est vendue ou retenue. Les tarifs sont reliés aux nouvelles catégories dans l'ordre.
 */
export async function applySeatingTemplate(ctx: OrgContext, eventId: string, template: SeatingTemplate, options: TemplateOptions = {}) {
  const map = await mapFor(ctx, eventId);
  if (await db.seat.count({ where: { row: { seatingMapId: map.id }, status: { in: ["SOLD", "HELD"] } } })) throw new CoreError("SEATING_HAS_SALES");
  const plan = seatingTemplate(template, options);
  await db.$transaction(async (tx) => {
    await tx.seatingBlock.deleteMany({ where: { seatingMapId: map.id } });
    await tx.seatingRow.deleteMany({ where: { seatingMapId: map.id } });
    await tx.seatingCategory.deleteMany({ where: { seatingMapId: map.id } });
    const cats = new Map<string, string>();
    for (const [i, c] of plan.categories.entries()) cats.set(c.key, (await tx.seatingCategory.create({ data: { seatingMapId: map.id, name: c.name, color: c.color, sortOrder: i } })).id);
    const types = await tx.ticketType.findMany({ where: { eventId: map.eventId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    const ordered = [...cats.values()];
    for (const [i, t] of types.entries()) await tx.ticketType.update({ where: { id: t.id }, data: { seatingCategoryId: ordered[Math.min(i, ordered.length - 1)] ?? null } });
    let rowOrder = 0;
    for (const [i, b] of plan.blocks.entries()) {
      const block = await tx.seatingBlock.create({ data: { seatingMapId: map.id, kind: b.kind, name: b.name, x: b.x, y: b.y, rotation: b.rotation, params: b.params as object, sortOrder: i } });
      for (const r of generateBlock(b)) {
        const categoryId = cats.get(r.category) ?? ordered[0]!;
        const row = await tx.seatingRow.create({ data: { seatingMapId: map.id, blockId: block.id, categoryId, name: r.label, sortOrder: rowOrder++ } });
        await tx.seat.createMany({ data: r.seats.map((st) => ({ rowId: row.id, categoryId, label: st.label, sortOrder: st.order, x: st.x, y: st.y, angle: st.angle, accessible: st.accessible })) });
      }
    }
    await tx.seatingMap.update({ where: { id: map.id }, data: { template, focusX: plan.focus.x, focusY: plan.focus.y } });
  }, { timeout: 60_000 });
  await audit({ action: "seating.template_applied", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "SeatingMap", targetId: map.id, metadata: { template } });
  return { blocks: plan.blocks.length, seats: await db.seat.count({ where: { row: { seatingMapId: map.id } } }) };
}
