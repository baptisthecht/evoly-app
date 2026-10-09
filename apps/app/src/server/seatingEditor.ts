import { pick } from "@evoly/i18n";
import "server-only";
import { CoreError, generateBlock, type BlockSpec, PALETTE } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { findEvent } from "./events";
import { seatingMapFor } from "./seating";
import { uploadImage } from "./brand";
import { deletePublicFile } from "./storage";
import { emailBrandFor } from "./email/brand";
import { sendEmail } from "./email/send";
import { seatChangedEmail } from "./email/templates";
import { ticketsUrl } from "./orders";

/** Section 9.9 : éditeur visuel du plan de salle (blocs, places, catégories). */

const FOCUS_SHAPES = new Set(["stage", "screen", "altar", "pitch"]);
type Kind = BlockSpec["kind"];
export type BlockInput = { id?: string | null; kind: Kind; name: string; x: number; y: number; rotation: number; params: Record<string, unknown> };

/** Plans d'avant les blocs : coordonnées en grille enregistrées, pour l'affichage comme pour les meilleures places. */
async function ensureSeatCoordinates(mapId: string) {
  const rows = await db.seatingRow.findMany({
    where: { seatingMapId: mapId, blockId: null },
    orderBy: { sortOrder: "asc" },
    include: { seats: { orderBy: { sortOrder: "asc" }, select: { id: true, x: true } } },
  });
  const missing = rows.some((r) => r.seats.some((s) => s.x === null));
  if (missing)
    await db.$transaction(
      rows.flatMap((r, i) =>
        r.seats.map((s, k) => db.seat.update({ where: { id: s.id }, data: { x: (k - (r.seats.length - 1) / 2) * 30, y: i * 34, angle: 0 } })),
      ),
    );
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
        rows: {
          orderBy: { sortOrder: "asc" },
          include: {
            seats: {
              orderBy: { sortOrder: "asc" },
              include: {
                ticket: {
                  select: {
                    holderFirstName: true,
                    holderLastName: true,
                    checkedInAt: true,
                    order: { select: { reference: true, buyerFirstName: true, buyerLastName: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.ticketType.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, seatingCategoryId: true } }),
  ]);
  const seats = full.rows.flatMap((r) =>
    r.seats.map((s) => ({
      id: s.id,
      rowId: r.id,
      row: r.name,
      blockId: r.blockId,
      label: s.label,
      x: s.x ?? 0,
      y: s.y ?? 0,
      angle: s.angle,
      status: s.status,
      accessible: s.accessible,
      note: s.note,
      categoryId: s.categoryId,
      holder: holderOf(s.ticket),
    })),
  );
  return {
    mode: event.seatingMode,
    allowChoice: event.allowSeatChoice,
    template: full.template,
    focus: full.focusX !== null && full.focusY !== null ? { x: full.focusX, y: full.focusY } : null,
    categories: full.categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      ticketTypeIds: ticketTypes.filter((t) => t.seatingCategoryId === c.id).map((t) => t.id),
    })),
    ticketTypes: ticketTypes.map((t) => ({ id: t.id, name: t.name, categoryId: t.seatingCategoryId })),
    blocks: full.blocks.map((b) => ({
      id: b.id,
      kind: b.kind as Kind,
      name: b.name,
      x: b.x,
      y: b.y,
      rotation: b.rotation,
      params: b.params as Record<string, unknown>,
    })),
    rows: full.rows.map((r) => ({ id: r.id, name: r.name, blockId: r.blockId, categoryId: r.categoryId })),
    seats,
    hasSales: seats.some((s) => s.status === "SOLD" || s.status === "HELD"),
  };
}
export type SeatingEditorState = Awaited<ReturnType<typeof seatingEditor>>;

async function refreshFocus(mapId: string) {
  const shape = (await db.seatingBlock.findMany({ where: { seatingMapId: mapId, kind: "SHAPE" }, orderBy: { sortOrder: "asc" } })).find((b) =>
    FOCUS_SHAPES.has(String((b.params as Record<string, unknown>).shape)),
  );
  if (shape) await db.seatingMap.update({ where: { id: mapId }, data: { focusX: shape.x, focusY: shape.y } });
}

async function defaultCategory(mapId: string) {
  return (
    (await db.seatingCategory.findFirst({ where: { seatingMapId: mapId }, orderBy: { sortOrder: "asc" } })) ??
    (await db.seatingCategory.create({ data: { seatingMapId: mapId, name: "Catégorie 1", color: PALETTE.rose, sortOrder: 0 } }))
  );
}

/** Structure d'un bloc : tout sauf la photo de vue, qui peut changer même quand des places sont vendues. */
const geometryKey = (b: { kind: string; params: unknown }) => {
  const { viewUrl: _view, ...rest } = (b.params ?? {}) as Record<string, unknown>;
  return JSON.stringify([b.kind, rest]);
};

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
  const existing = input.id
    ? await db.seatingBlock.findFirst({
        where: { id: input.id, seatingMapId: map.id },
        include: { rows: { orderBy: { sortOrder: "asc" }, include: { seats: { orderBy: { sortOrder: "asc" } } } } },
      })
    : null;
  if (input.id && !existing) throw new CoreError("NOT_FOUND");
  const blockId = await db.$transaction(
    async (tx) => {
      if (existing && geometryKey(existing) === geometryKey(spec)) {
        await tx.seatingBlock.update({
          where: { id: existing.id },
          data: { name: spec.name, x: spec.x, y: spec.y, rotation: spec.rotation, params: spec.params as object },
        });
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
        ? await tx.seatingBlock.update({
            where: { id: existing.id },
            data: { kind: spec.kind, name: spec.name, x: spec.x, y: spec.y, rotation: spec.rotation, params: spec.params as object },
          })
        : await tx.seatingBlock.create({
            data: {
              seatingMapId: map.id,
              kind: spec.kind,
              name: spec.name,
              x: spec.x,
              y: spec.y,
              rotation: spec.rotation,
              params: spec.params as object,
              sortOrder: await tx.seatingBlock.count({ where: { seatingMapId: map.id } }),
            },
          });
      let order = ((await tx.seatingRow.aggregate({ where: { seatingMapId: map.id }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
      for (const r of generated) {
        const categoryId = categoryIds.has(r.category) ? r.category : fallback;
        const row = await tx.seatingRow.create({ data: { seatingMapId: map.id, blockId: block.id, categoryId, name: r.label, sortOrder: order++ } });
        await tx.seat.createMany({
          data: r.seats.map((st) => {
            const k = kept.get(`${r.label}|${st.label}`);
            return {
              rowId: row.id,
              categoryId,
              label: st.label,
              sortOrder: st.order,
              x: st.x,
              y: st.y,
              angle: st.angle,
              accessible: k ? k.accessible : st.accessible,
              note: k?.note ?? null,
              status: k?.status ?? "AVAILABLE",
            };
          }),
        });
      }
      return block.id;
    },
    { timeout: 60_000 },
  );
  await refreshFocus(map.id);
  await audit({
    action: existing ? "seating.block_updated" : "seating.block_created",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "SeatingBlock",
    targetId: blockId,
    metadata: { kind: spec.kind },
  });
  return blockId;
}

export async function deleteSeatingBlock(ctx: OrgContext, eventId: string, blockId: string) {
  const map = await seatingMapFor(ctx, eventId);
  const block = await db.seatingBlock.findFirst({ where: { id: blockId, seatingMapId: map.id } });
  if (!block) throw new CoreError("NOT_FOUND");
  if (await db.seat.count({ where: { row: { blockId }, status: { in: ["SOLD", "HELD"] } } })) throw new CoreError("SEATING_BLOCK_HAS_SALES");
  await db.seatingBlock.delete({ where: { id: blockId } });
  await refreshFocus(map.id);
  await audit({
    action: "seating.block_deleted",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "SeatingBlock",
    targetId: blockId,
  });
}

/** Place : libellé, blocage, mobilité réduite, note interne. Une place vendue ou retenue ne change ni de libellé ni d'état. */
export async function updateSeat(
  ctx: OrgContext,
  eventId: string,
  seatId: string,
  patch: { label?: string; blocked?: boolean; accessible?: boolean; note?: string | null },
) {
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
export async function updateSeatingCategory(
  ctx: OrgContext,
  eventId: string,
  categoryId: string,
  input: { name: string; color: string; ticketTypeIds: string[] },
) {
  const map = await seatingMapFor(ctx, eventId);
  const cat = await db.seatingCategory.findFirst({ where: { id: categoryId, seatingMapId: map.id } });
  if (!cat) throw new CoreError("NOT_FOUND");
  const name = input.name.trim().slice(0, 40);
  if (name.length < 1 || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new CoreError("SEATING_CATEGORY_INVALID");
  await db.$transaction([
    db.seatingCategory.update({ where: { id: cat.id }, data: { name, color: input.color } }),
    db.ticketType.updateMany({
      where: { eventId: map.eventId, seatingCategoryId: cat.id, id: { notIn: input.ticketTypeIds } },
      data: { seatingCategoryId: null },
    }),
    db.ticketType.updateMany({ where: { eventId: map.eventId, id: { in: input.ticketTypeIds } }, data: { seatingCategoryId: cat.id } }),
  ]);
}

type TicketHolder = {
  holderFirstName: string | null;
  holderLastName: string | null;
  checkedInAt: Date | null;
  order: { reference: string; buyerFirstName: string; buyerLastName: string };
} | null;
/** Titulaire d'une place vendue : nom complet pour l'organisateur, référence de commande, entrée déjà scannée. */
function holderOf(t: TicketHolder) {
  if (!t) return null;
  return {
    name: `${t.holderFirstName ?? t.order.buyerFirstName} ${t.holderLastName ?? t.order.buyerLastName}`.trim(),
    reference: t.order.reference,
    entered: t.checkedInAt !== null,
  };
}
const SEAT_NAME = {
  fr: (r: string, l: string) => `rang ${r}, place ${l}`,
  en: (r: string, l: string) => `row ${r}, seat ${l}`,
  es: (r: string, l: string) => `fila ${r}, plaza ${l}`,
  de: (r: string, l: string) => `Reihe ${r}, Platz ${l}`,
  it: (r: string, l: string) => `fila ${r}, posto ${l}`,
  pt: (r: string, l: string) => `fila ${r}, lugar ${l}`,
  nl: (r: string, l: string) => `rij ${r}, plaats ${l}`,
};
const seatName = (row: string, label: string, locale: string) => pick(SEAT_NAME, locale)(row, label);

/**
 * Change un billet de place : place libre de la même catégorie, prise en une transaction (refusée si elle vient
 * d'être prise), ancienne place libérée. Le titulaire reçoit un e-mail avec le lien vers son billet mis à jour.
 */
export async function moveTicketSeat(ctx: OrgContext, eventId: string, fromSeatId: string, toSeatId: string) {
  const map = await seatingMapFor(ctx, eventId);
  const [from, to] = await Promise.all([
    db.seat.findFirst({
      where: { id: fromSeatId, row: { seatingMapId: map.id } },
      include: { row: true, ticket: { include: { order: { include: { organization: true, event: true } } } } },
    }),
    db.seat.findFirst({ where: { id: toSeatId, row: { seatingMapId: map.id } }, include: { row: true } }),
  ]);
  if (!from || !to) throw new CoreError("NOT_FOUND");
  if (from.status !== "SOLD" || !from.ticket) throw new CoreError("SEAT_NOT_SOLD");
  if (to.categoryId !== from.categoryId) throw new CoreError("SEAT_CATEGORY_MISMATCH");
  const ticket = from.ticket;
  await db.$transaction(async (tx) => {
    const took = await tx.seat.updateMany({ where: { id: to.id, status: "AVAILABLE" }, data: { status: "SOLD" } });
    if (took.count !== 1) throw new CoreError("SEAT_TAKEN");
    await tx.ticket.update({ where: { id: ticket.id }, data: { seatId: to.id } });
    await tx.seat.update({ where: { id: from.id }, data: { status: "AVAILABLE", holdOrderId: null, holdExpiresAt: null } });
  });
  const order = ticket.order;
  const locale = (order.buyerLocale === "en" ? "en" : "fr") as "fr" | "en";
  const brand = await emailBrandFor(order.organizationId);
  const mail = seatChangedEmail({
    brand,
    locale,
    organizationName: order.organization.name,
    eventTitle: order.event.title,
    firstName: ticket.holderFirstName ?? order.buyerFirstName,
    from: seatName(from.row.name, from.label, locale),
    to: seatName(to.row.name, to.label, locale),
    url: ticketsUrl(order.organization, order.id, order.accessTokenVersion),
  });
  await sendEmail({
    ...mail,
    to: ticket.holderEmail ?? order.buyerEmail,
    template: "seating.seat_changed",
    category: "TRANSACTIONAL",
    organizationId: order.organizationId,
    fromName: brand.fromName,
    replyTo: brand.replyTo,
  }).catch((err) => console.error("e-mail changement de place", err instanceof Error ? err.message : err));
  await audit({
    action: "seating.ticket_moved",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Ticket",
    targetId: ticket.id,
    metadata: { from: `${from.row.name}${from.label}`, to: `${to.row.name}${to.label}` },
  });
}

/** Plan d'occupation pour l'accueil : état de chaque place (libre, bloquée, vendue, entrée) et titulaire abrégé. */
export async function seatOccupancy(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  const map = await db.seatingMap.findUnique({
    where: { eventId: event.id },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      blocks: { orderBy: { sortOrder: "asc" } },
      rows: {
        orderBy: { sortOrder: "asc" },
        include: {
          seats: {
            orderBy: { sortOrder: "asc" },
            include: {
              ticket: {
                select: { holderFirstName: true, holderLastName: true, checkedInAt: true, order: { select: { buyerFirstName: true, buyerLastName: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!map || !map.rows.some((r) => r.seats.length)) return null;
  const short = (first: string, last: string) => `${first} ${last ? `${last.charAt(0)}.` : ""}`.trim();
  const seats = map.rows.flatMap((r, i) =>
    r.seats.map((s, k) => ({
      id: s.id,
      rowId: r.id,
      row: r.name,
      blockId: r.blockId,
      label: s.label,
      x: s.x ?? (k - (r.seats.length - 1) / 2) * 30,
      y: s.y ?? i * 34,
      angle: s.angle,
      categoryId: s.categoryId,
      accessible: s.accessible,
      state: (s.ticket?.checkedInAt ? "IN" : s.status === "SOLD" ? "SOLD" : s.status === "HELD" ? "HELD" : s.status === "BLOCKED" ? "BLOCKED" : "FREE") as
        "IN" | "SOLD" | "HELD" | "BLOCKED" | "FREE",
      holder: s.ticket ? short(s.ticket.holderFirstName ?? s.ticket.order.buyerFirstName, s.ticket.holderLastName ?? s.ticket.order.buyerLastName) : null,
    })),
  );
  const count = (st: string) => seats.filter((s) => s.state === st).length;
  return {
    categories: map.categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    blocks: map.blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      name: b.name,
      x: b.x,
      y: b.y,
      rotation: b.rotation,
      params: b.params as Record<string, unknown>,
    })),
    rows: map.rows.map((r) => ({ id: r.id, name: r.name, blockId: r.blockId })),
    seats,
    counts: { total: seats.length, entered: count("IN"), sold: count("SOLD") + count("IN"), free: count("FREE"), blocked: count("BLOCKED") },
  };
}
export type SeatOccupancy = NonNullable<Awaited<ReturnType<typeof seatOccupancy>>>;

/** Vue depuis la place : photo d'un bloc (envoi, remplacement, suppression), possible même avec des places vendues. */
export async function setBlockView(ctx: OrgContext, eventId: string, blockId: string, bytes: Uint8Array | null) {
  const map = await seatingMapFor(ctx, eventId);
  const block = await db.seatingBlock.findFirst({ where: { id: blockId, seatingMapId: map.id } });
  if (!block || block.kind === "SHAPE") throw new CoreError("NOT_FOUND");
  const params = { ...(block.params as Record<string, unknown>) };
  const previous = typeof params.viewUrl === "string" ? params.viewUrl : null;
  if (bytes) params.viewUrl = await uploadImage(ctx, "seatview", bytes, map.eventId);
  else delete params.viewUrl;
  await db.seatingBlock.update({ where: { id: block.id }, data: { params: params as object } });
  if (previous) await deletePublicFile(previous).catch(() => undefined);
  return (params.viewUrl as string | undefined) ?? null;
}

/**
 * Carte de chaleur des ventes : moment de la vente de chaque place, de 0 (vendue la première) à 1 (la dernière),
 * et constats par rang pour ajuster les prix de l'événement suivant (au moins 10 places vendues).
 */
export async function seatSalesHeat(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  const map = await db.seatingMap.findUnique({
    where: { eventId: event.id },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      blocks: { orderBy: { sortOrder: "asc" } },
      rows: {
        orderBy: { sortOrder: "asc" },
        include: { seats: { orderBy: { sortOrder: "asc" }, include: { ticket: { select: { order: { select: { paidAt: true, createdAt: true } } } } } } },
      },
    },
  });
  if (!map) return null;
  const soldAt = (s: (typeof map.rows)[number]["seats"][number]) =>
    s.status === "SOLD" && s.ticket ? (s.ticket.order.paidAt ?? s.ticket.order.createdAt).getTime() : null;
  const times = map.rows.flatMap((r) => r.seats.map(soldAt)).filter((t): t is number => t !== null);
  const t0 = times.length ? Math.min(...times) : 0,
    t1 = times.length ? Math.max(...times) : 0;
  const seats = map.rows.flatMap((r, i) =>
    r.seats.map((s, k) => {
      const t = soldAt(s);
      return {
        id: s.id,
        rowId: r.id,
        row: r.name,
        blockId: r.blockId,
        label: s.label,
        x: s.x ?? (k - (r.seats.length - 1) / 2) * 30,
        y: s.y ?? i * 34,
        angle: s.angle,
        categoryId: s.categoryId,
        blocked: s.status === "BLOCKED",
        heat: t === null ? null : t1 > t0 ? (t - t0) / (t1 - t0) : 0,
      };
    }),
  );
  const rowStats = map.rows.map((r) => {
    const own = seats.filter((s) => s.rowId === r.id && !s.blocked);
    const heats = own
      .map((s) => s.heat)
      .filter((h): h is number => h !== null)
      .sort((a, b) => a - b);
    return { row: r.name, ratio: own.length ? heats.length / own.length : 0, median: heats.length ? heats[Math.floor(heats.length / 2)]! : 1 };
  });
  const enough = times.length >= 10;
  return {
    categories: map.categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    blocks: map.blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      name: b.name,
      x: b.x,
      y: b.y,
      rotation: b.rotation,
      params: b.params as Record<string, unknown>,
    })),
    rows: map.rows.map((r) => ({ id: r.id, name: r.name, blockId: r.blockId })),
    seats,
    sold: times.length,
    total: seats.filter((s) => !s.blocked).length,
    firstSaleAt: times.length ? new Date(t0) : null,
    lastSaleAt: times.length ? new Date(t1) : null,
    fastRows: enough ? rowStats.filter((r) => r.ratio >= 0.9 && r.median <= 0.34).map((r) => r.row) : [],
    slowRows: enough ? rowStats.filter((r) => r.ratio <= 0.4).map((r) => r.row) : [],
  };
}
export type SeatSalesHeat = NonNullable<Awaited<ReturnType<typeof seatSalesHeat>>>;
