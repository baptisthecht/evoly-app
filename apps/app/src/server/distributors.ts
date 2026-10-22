import "server-only";
import { CoreError, hasFeature } from "@evoly/core";
import { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { lockEvent } from "./checkout";
import type { OrgContext } from "./context";
import { findEvent } from "./events";

// Compatibilité avec les réseaux de billetterie (docs/COMPATIBILITE_RESEAUX.md) : réseaux de l'organisation et contingents.
// Places libres en placement libre : un nombre par tarif, retiré de la vente en ligne (quantityAllocated, règle unique du
// paquet core). Places numérotées : des places précises du plan, bloquées et marquées du réseau (le compteur des tarifs n'est
// pas touché, sinon les mêmes places seraient retirées deux fois de la vente).

export const DISTRIBUTOR_KINDS = ["TICKETMASTER", "FRANCE_BILLET", "BILLETREDUC", "PASS_CULTURE", "TOURIST_OFFICE", "WORKS_COUNCIL", "OTHER"] as const;
export type DistributorKind = (typeof DISTRIBUTOR_KINDS)[number];

/** Nom proposé à la création (modifiable) : celui sous lequel l'organisateur connaît le réseau. */
export const DEFAULT_DISTRIBUTOR_NAMES: Record<DistributorKind, string> = {
  TICKETMASTER: "Ticketmaster",
  FRANCE_BILLET: "Fnac – France Billet",
  BILLETREDUC: "BilletReduc",
  PASS_CULTURE: "Pass Culture",
  TOURIST_OFFICE: "Office de tourisme",
  WORKS_COUNCIL: "Comité d’entreprise",
  OTHER: "",
};

const MAX_ALLOCATION = 100_000;
const cleanName = (name: string) => name.replace(/\s+/g, " ").trim();
const isKind = (kind: string): kind is DistributorKind => (DISTRIBUTOR_KINDS as readonly string[]).includes(kind);

function requireDistribution(ctx: OrgContext) {
  if (!hasFeature(ctx.features, "DISTRIBUTION")) throw new CoreError("PRO_REQUIRED");
}

async function findDistributor(ctx: OrgContext, distributorId: string) {
  const d = await db.distributor.findFirst({ where: { id: distributorId, organizationId: ctx.organization.id, archivedAt: null } });
  if (!d) throw new CoreError("NOT_FOUND");
  return d;
}

const log = (ctx: OrgContext, action: string, targetId: string, metadata?: Record<string, string | number | boolean | null>) =>
  audit({ action, organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Distributor", targetId, metadata });

// ─── Réseaux ────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function listDistributors(ctx: OrgContext) {
  return db.distributor.findMany({
    where: { organizationId: ctx.organization.id, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, kind: true, name: true },
  });
}

export async function createDistributor(ctx: OrgContext, input: { kind: string; name?: string | null }) {
  requireDistribution(ctx);
  if (!isKind(input.kind)) throw new CoreError("DISTRIBUTOR_KIND_INVALID");
  const name = cleanName(input.name || DEFAULT_DISTRIBUTOR_NAMES[input.kind]);
  if (name.length < 2 || name.length > 60) throw new CoreError("DISTRIBUTOR_NAME_INVALID");
  const existing = await db.distributor.findFirst({ where: { organizationId: ctx.organization.id, name } });
  if (existing && !existing.archivedAt) throw new CoreError("DISTRIBUTOR_NAME_TAKEN");
  // un réseau archivé du même nom revient, avec son historique (billets importés, réglages d'import)
  const d = existing
    ? await db.distributor.update({ where: { id: existing.id }, data: { archivedAt: null, kind: input.kind } })
    : await db.distributor.create({ data: { organizationId: ctx.organization.id, kind: input.kind, name } });
  await log(ctx, existing ? "distributor.restored" : "distributor.created", d.id, { kind: d.kind });
  return d;
}

export async function renameDistributor(ctx: OrgContext, distributorId: string, rawName: string) {
  requireDistribution(ctx);
  const d = await findDistributor(ctx, distributorId);
  const name = cleanName(rawName);
  if (name.length < 2 || name.length > 60) throw new CoreError("DISTRIBUTOR_NAME_INVALID");
  if (name === d.name) return d;
  try {
    const updated = await db.distributor.update({ where: { id: d.id }, data: { name } });
    await log(ctx, "distributor.renamed", d.id);
    return updated;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new CoreError("DISTRIBUTOR_NAME_TAKEN");
    throw e;
  }
}

/** Archivé : n'apparaît plus dans les choix ; ses billets importés et ses contingents restent (bilan, contrôle). */
export async function archiveDistributor(ctx: OrgContext, distributorId: string) {
  requireDistribution(ctx);
  const d = await findDistributor(ctx, distributorId);
  await db.distributor.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
  await log(ctx, "distributor.archived", d.id);
}

// ─── Contingents en placement libre ─────────────────────────────────────────────────────────────────────────────────

const importedCount = (tx: Prisma.TransactionClient | typeof db, eventId: string, distributorId: string, ticketTypeId: string) =>
  tx.externalTicket.count({ where: { eventId, distributorId, ticketTypeId, status: "VALID" } });

/**
 * Contingent d'un tarif pour un réseau : jamais au-delà des places encore en vente en ligne (tarif et jauge), jamais sous
 * les billets déjà importés ; 0 le supprime. Sous le verrou de l'événement, comme le panier : une vente en ligne simultanée
 * ne peut pas prendre les mêmes places.
 */
export async function setAllocation(ctx: OrgContext, eventId: string, input: { distributorId: string; ticketTypeId: string; quantity: number }) {
  requireDistribution(ctx);
  const event = await findEvent(ctx, eventId);
  if (event.seatingMode === "ASSIGNED") throw new CoreError("ALLOCATION_USE_SEATS");
  if (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > MAX_ALLOCATION) throw new CoreError("ALLOCATION_QUANTITY_INVALID");
  const distributor = await findDistributor(ctx, input.distributorId);
  const tt = await db.ticketType.findFirst({ where: { id: input.ticketTypeId, eventId } });
  if (!tt) throw new CoreError("NOT_FOUND");
  const quantity = input.quantity;

  const result = await db.$transaction(async (tx) => {
    if (!(await lockEvent(tx, eventId))) throw new CoreError("NOT_FOUND");
    const current = await tx.distributorAllocation.findUnique({
      where: { ticketTypeId_distributorId: { ticketTypeId: tt.id, distributorId: distributor.id } },
    });
    const imported = await importedCount(tx, eventId, distributor.id, tt.id);
    if (quantity < imported) throw new CoreError("ALLOCATION_BELOW_IMPORTED");
    const delta = quantity - (current?.quantity ?? 0);
    if (delta > 0) {
      const ok =
        await tx.$executeRaw`UPDATE "TicketType" SET "quantityAllocated" = "quantityAllocated" + ${delta} WHERE id = ${tt.id} AND ("quantity" IS NULL OR "quantity" - "quantitySold" - "quantityHeld" - "quantityAllocated" >= ${delta})`;
      if (ok !== 1) throw new CoreError("ALLOCATION_EXCEEDS_STOCK");
      if (event.capacity != null) {
        const totals = await tx.ticketType.aggregate({ where: { eventId }, _sum: { quantitySold: true, quantityHeld: true, quantityAllocated: true } });
        const used = (totals._sum.quantitySold ?? 0) + (totals._sum.quantityHeld ?? 0) + (totals._sum.quantityAllocated ?? 0);
        if (used > event.capacity) throw new CoreError("ALLOCATION_EXCEEDS_STOCK"); // annule la transaction
      }
    } else if (delta < 0) {
      await tx.$executeRaw`UPDATE "TicketType" SET "quantityAllocated" = GREATEST(0, "quantityAllocated" - ${-delta}) WHERE id = ${tt.id}`;
    }
    if (quantity === 0) {
      if (current) await tx.distributorAllocation.delete({ where: { id: current.id } });
    } else {
      await tx.distributorAllocation.upsert({
        where: { ticketTypeId_distributorId: { ticketTypeId: tt.id, distributorId: distributor.id } },
        create: { eventId, distributorId: distributor.id, ticketTypeId: tt.id, quantity },
        update: { quantity },
      });
    }
    return { quantity, imported, released: Math.max(0, -delta) };
  });
  await log(ctx, "distributor.allocation_set", distributor.id, { eventId, ticketTypeId: tt.id, quantity });
  return result;
}

// ─── Places numérotées ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Places du plan confiées à un réseau (assign) ou rendues à la vente en ligne (release). Seules des places libres se
 * confient ; une place qui porte un billet importé ne se rend pas. Renvoie le nombre de places réellement changées.
 */
export async function setDistributorSeats(ctx: OrgContext, eventId: string, input: { distributorId: string; seatIds: string[]; assign: boolean }) {
  requireDistribution(ctx);
  const event = await findEvent(ctx, eventId);
  if (event.seatingMode !== "ASSIGNED") throw new CoreError("ALLOCATION_USE_QUANTITY");
  const distributor = await findDistributor(ctx, input.distributorId);
  const ids = [...new Set(input.seatIds)].slice(0, 5_000);
  const changed = await db.$transaction(async (tx) => {
    if (!(await lockEvent(tx, eventId))) throw new CoreError("NOT_FOUND");
    const onMap = { id: { in: ids }, row: { seatingMap: { eventId } } } satisfies Prisma.SeatWhereInput;
    const r = input.assign
      ? await tx.seat.updateMany({ where: { ...onMap, status: "AVAILABLE" }, data: { status: "BLOCKED", distributorId: distributor.id } })
      : await tx.seat.updateMany({
          where: { ...onMap, distributorId: distributor.id, externalTicket: null },
          data: { status: "AVAILABLE", distributorId: null },
        });
    return r.count;
  });
  await log(ctx, input.assign ? "distributor.seats_assigned" : "distributor.seats_released", distributor.id, { eventId, seats: changed });
  return { changed };
}

// ─── Rendre les invendus ────────────────────────────────────────────────────────────────────────────────────────────

/** Ramène les contingents du réseau aux billets importés : les places reviennent à la vente en ligne (et à la liste d'attente). */
export async function releaseUnsold(ctx: OrgContext, eventId: string, distributorId: string) {
  requireDistribution(ctx);
  const event = await findEvent(ctx, eventId);
  const distributor = await findDistributor(ctx, distributorId);
  let released = 0;
  if (event.seatingMode === "ASSIGNED") {
    const seats = await db.seat.findMany({
      where: { distributorId: distributor.id, externalTicket: null, row: { seatingMap: { eventId } } },
      select: { id: true },
    });
    if (seats.length)
      released = (await setDistributorSeats(ctx, eventId, { distributorId: distributor.id, seatIds: seats.map((s) => s.id), assign: false })).changed;
  } else {
    for (const a of await db.distributorAllocation.findMany({ where: { eventId, distributorId: distributor.id } })) {
      const imported = await importedCount(db, eventId, distributor.id, a.ticketTypeId);
      if (a.quantity > imported)
        released += (await setAllocation(ctx, eventId, { distributorId: distributor.id, ticketTypeId: a.ticketTypeId, quantity: imported })).released;
    }
  }
  await log(ctx, "distributor.unsold_released", distributor.id, { eventId, released });
  return { released };
}

// ─── Récapitulatif ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Par réseau : places confiées, billets importés, entrées ; par tarif en placement libre. */
export async function eventDistribution(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  const [distributors, ticketTypes, allocations, tickets, seats] = await Promise.all([
    listDistributors(ctx),
    db.ticketType.findMany({
      where: { eventId, status: { not: "ARCHIVED" } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, quantity: true, quantitySold: true, quantityHeld: true, quantityAllocated: true },
    }),
    db.distributorAllocation.findMany({ where: { eventId }, select: { distributorId: true, ticketTypeId: true, quantity: true } }),
    db.externalTicket.groupBy({
      by: ["distributorId", "ticketTypeId"],
      where: { eventId, status: "VALID" },
      _count: { _all: true },
      _sum: { priceMinor: true },
    }),
    event.seatingMode === "ASSIGNED"
      ? db.seat.groupBy({ by: ["distributorId"], where: { distributorId: { not: null }, row: { seatingMap: { eventId } } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const entered = await db.externalTicket.groupBy({
    by: ["distributorId"],
    where: { eventId, status: "VALID", checkedInAt: { not: null } },
    _count: { _all: true },
  });
  return {
    seated: event.seatingMode === "ASSIGNED",
    distributors: distributors.map((d) => ({
      ...d,
      allocated:
        event.seatingMode === "ASSIGNED"
          ? (seats.find((s) => s.distributorId === d.id)?._count._all ?? 0)
          : allocations.filter((a) => a.distributorId === d.id).reduce((n, a) => n + a.quantity, 0),
      imported: tickets.filter((t) => t.distributorId === d.id).reduce((n, t) => n + t._count._all, 0),
      revenueMinor: tickets.filter((t) => t.distributorId === d.id).reduce((n, t) => n + (t._sum.priceMinor ?? 0), 0),
      entered: entered.find((e) => e.distributorId === d.id)?._count._all ?? 0,
    })),
    ticketTypes: ticketTypes.map((t) => ({
      ...t,
      onlineLeft: t.quantity == null ? null : Math.max(0, t.quantity - t.quantitySold - t.quantityHeld - t.quantityAllocated),
      allocations: allocations
        .filter((a) => a.ticketTypeId === t.id)
        .map((a) => ({
          distributorId: a.distributorId,
          quantity: a.quantity,
          imported: tickets.find((x) => x.distributorId === a.distributorId && x.ticketTypeId === t.id)?._count._all ?? 0,
        })),
    })),
  };
}
