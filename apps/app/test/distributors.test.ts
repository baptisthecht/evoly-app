import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import {
  archiveDistributor,
  createDistributor,
  eventDistribution,
  releaseUnsold,
  renameDistributor,
  setAllocation,
  setDistributorSeats,
} from "@/server/distributors";
import { createEvent, publishEvent } from "@/server/events";
import { addRow, saveCategory, setSeatingMode } from "@/server/seating";

// réseaux de billetterie et contingents (docs/COMPATIBILITE_RESEAUX.md)
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Gala de printemps",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-18T02:00",
  timezone: "Europe/Brussels",
  locationType: "PHYSICAL" as const,
  locationName: "Salle des fêtes",
  city: "Mouscron",
  country: "BE",
};
async function org(o: { pro?: boolean } = {}) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const organization = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "FR", currency: "EUR", timezone: "Europe/Paris", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: organization.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (o.pro !== false)
    await db.subscription.create({
      data: { organizationId: organization.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) },
    });
  const ctx = { ...(await findOrgContext(owner.id, organization.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { ctx, organization };
}
async function gaEvent(ctx: Awaited<ReturnType<typeof org>>["ctx"], o: { quantity: number | null; capacity?: number }) {
  const event = await createEvent(ctx, essentials, { name: "Fosse", price: "0", quantity: o.quantity ?? 10 });
  const tt = await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } });
  await db.ticketType.update({ where: { id: tt.id }, data: { quantity: o.quantity } });
  if (o.capacity != null) await db.event.update({ where: { id: event.id }, data: { capacity: o.capacity } });
  return { eventId: event.id, ticketTypeId: tt.id };
}
const refused = (code: string) => expect.objectContaining({ code });
const imported = (eventId: string, distributorId: string, ticketTypeId: string, n: number) =>
  db.externalTicket.createMany({ data: Array.from({ length: n }, (_, i) => ({ eventId, distributorId, ticketTypeId, code: `TM-${rid()}-${i}` })) });
const allocated = async (ticketTypeId: string) => (await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).quantityAllocated;

describe("réseaux de l'organisation", () => {
  it("réservés au Pro ; nom proposé selon le réseau ; nom libre pour « autre » ; nom déjà pris refusé", async () => {
    const free = await org({ pro: false });
    await expect(createDistributor(free.ctx, { kind: "TICKETMASTER" })).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx } = await org();
    expect((await createDistributor(ctx, { kind: "FRANCE_BILLET" })).name).toBe("Fnac (France Billet)");
    await expect(createDistributor(ctx, { kind: "OTHER" })).rejects.toEqual(refused("DISTRIBUTOR_NAME_INVALID"));
    expect((await createDistributor(ctx, { kind: "OTHER", name: "  Comité   Airbus " })).name).toBe("Comité Airbus");
    await expect(createDistributor(ctx, { kind: "OTHER", name: "Fnac (France Billet)" })).rejects.toEqual(refused("DISTRIBUTOR_NAME_TAKEN"));
    await expect(createDistributor(ctx, { kind: "INCONNU" })).rejects.toEqual(refused("DISTRIBUTOR_KIND_INVALID"));
  });

  it("archivé puis recréé sous le même nom : le même réseau revient, avec son historique ; renommage", async () => {
    const { ctx } = await org();
    const tm = await createDistributor(ctx, { kind: "TICKETMASTER" });
    await archiveDistributor(ctx, tm.id);
    const again = await createDistributor(ctx, { kind: "TICKETMASTER" });
    expect(again.id).toBe(tm.id);
    expect((await renameDistributor(ctx, tm.id, "Ticketmaster France")).name).toBe("Ticketmaster France");
    const actions = (await db.auditLog.findMany({ where: { targetId: tm.id }, orderBy: { createdAt: "asc" }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(["distributor.created", "distributor.archived", "distributor.restored", "distributor.renamed"]);
  });
});

describe("contingents en placement libre", () => {
  it("jamais au-delà des places en vente ; diminué : places rendues ; à zéro : supprimé", async () => {
    const { ctx } = await org();
    const { eventId, ticketTypeId } = await gaEvent(ctx, { quantity: 10 });
    const tm = await createDistributor(ctx, { kind: "TICKETMASTER" });
    const fnac = await createDistributor(ctx, { kind: "FRANCE_BILLET" });
    await setAllocation(ctx, eventId, { distributorId: tm.id, ticketTypeId, quantity: 6 });
    await expect(setAllocation(ctx, eventId, { distributorId: fnac.id, ticketTypeId, quantity: 5 })).rejects.toEqual(refused("ALLOCATION_EXCEEDS_STOCK"));
    await setAllocation(ctx, eventId, { distributorId: fnac.id, ticketTypeId, quantity: 4 });
    expect(await allocated(ticketTypeId)).toBe(10);
    expect(await setAllocation(ctx, eventId, { distributorId: tm.id, ticketTypeId, quantity: 2 })).toMatchObject({ released: 4 });
    await setAllocation(ctx, eventId, { distributorId: fnac.id, ticketTypeId, quantity: 0 });
    expect([await allocated(ticketTypeId), await db.distributorAllocation.count({ where: { eventId } })]).toEqual([2, 1]);
    await expect(setAllocation(ctx, eventId, { distributorId: tm.id, ticketTypeId, quantity: 1.5 })).rejects.toEqual(refused("ALLOCATION_QUANTITY_INVALID"));
  });

  it("jauge : un tarif illimité ne dépasse pas la jauge de l'événement", async () => {
    const { ctx } = await org();
    const { eventId, ticketTypeId } = await gaEvent(ctx, { quantity: null, capacity: 8 });
    const tm = await createDistributor(ctx, { kind: "TICKETMASTER" });
    await expect(setAllocation(ctx, eventId, { distributorId: tm.id, ticketTypeId, quantity: 9 })).rejects.toEqual(refused("ALLOCATION_EXCEEDS_STOCK"));
    expect(await allocated(ticketTypeId)).toBe(0); // rien n'a été retenu
    await setAllocation(ctx, eventId, { distributorId: tm.id, ticketTypeId, quantity: 8 });
    expect(await allocated(ticketTypeId)).toBe(8);
  });

  it("jamais sous les billets importés ; « rendre les invendus » ramène le contingent aux importés ; récapitulatif", async () => {
    const { ctx } = await org();
    const { eventId, ticketTypeId } = await gaEvent(ctx, { quantity: 10 });
    const tm = await createDistributor(ctx, { kind: "TICKETMASTER" });
    await setAllocation(ctx, eventId, { distributorId: tm.id, ticketTypeId, quantity: 6 });
    await imported(eventId, tm.id, ticketTypeId, 2);
    await expect(setAllocation(ctx, eventId, { distributorId: tm.id, ticketTypeId, quantity: 1 })).rejects.toEqual(refused("ALLOCATION_BELOW_IMPORTED"));
    expect(await releaseUnsold(ctx, eventId, tm.id)).toEqual({ released: 4 });
    expect(await allocated(ticketTypeId)).toBe(2);
    const summary = await eventDistribution(ctx, eventId);
    expect(summary.distributors.find((d) => d.id === tm.id)).toMatchObject({ allocated: 2, imported: 2, entered: 0 });
    expect(summary.ticketTypes[0]).toMatchObject({ onlineLeft: 8, allocations: [{ distributorId: tm.id, quantity: 2, imported: 2 }] });
  });
});

describe("places numérotées confiées sur le plan", () => {
  it("seules les places libres se confient ; une place avec un billet importé ne se rend pas ; invendus rendus", async () => {
    const { ctx } = await org();
    const event = await createEvent(ctx, essentials, { name: "Parterre", price: "0", quantity: 100 });
    const ticketTypeId = (await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })).id;
    const cat = await saveCategory(ctx, event.id, { name: "Parterre", color: "#ffb8e8", ticketTypeId });
    const row = await addRow(ctx, event.id, { categoryId: cat.id, name: "A", seats: "4" });
    await setSeatingMode(ctx, event.id, true);
    await publishEvent(ctx, event.id);
    const seats = await db.seat.findMany({ where: { rowId: row.id }, orderBy: { sortOrder: "asc" } });
    const tm = await createDistributor(ctx, { kind: "TICKETMASTER" });
    await expect(setAllocation(ctx, event.id, { distributorId: tm.id, ticketTypeId, quantity: 2 })).rejects.toEqual(refused("ALLOCATION_USE_SEATS"));
    await db.seat.update({ where: { id: seats[3]!.id }, data: { status: "SOLD" } }); // déjà vendue en ligne
    expect(await setDistributorSeats(ctx, event.id, { distributorId: tm.id, seatIds: seats.map((s) => s.id), assign: true })).toEqual({ changed: 3 });
    await db.externalTicket.create({ data: { eventId: event.id, distributorId: tm.id, ticketTypeId, code: `TM-${rid()}`, seatId: seats[0]!.id } });
    expect(await releaseUnsold(ctx, event.id, tm.id)).toEqual({ released: 2 });
    const after = await db.seat.findMany({ where: { rowId: row.id }, orderBy: { sortOrder: "asc" }, select: { status: true, distributorId: true } });
    expect(after).toEqual([
      { status: "BLOCKED", distributorId: tm.id },
      { status: "AVAILABLE", distributorId: null },
      { status: "AVAILABLE", distributorId: null },
      { status: "SOLD", distributorId: null },
    ]);
    expect(await allocated(ticketTypeId)).toBe(0); // le compteur du tarif n'est pas touché en placement numéroté
    expect((await eventDistribution(ctx, event.id)).distributors[0]).toMatchObject({ allocated: 1, imported: 1 });
  });
});
