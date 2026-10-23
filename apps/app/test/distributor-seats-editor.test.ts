import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createDistributor, setDistributorSeats } from "@/server/distributors";
import { createEvent } from "@/server/events";
import { applySeatingTemplate, setSeatingMode } from "@/server/seating";
import { saveSeatingBlock, seatingEditor, updateSeat } from "@/server/seatingEditor";

// plan de salle et places confiées à un réseau : rien ne se perd à la modification d'un bloc ou d'une place
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Gala de printemps",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-18T02:00",
  timezone: "Europe/Paris",
  locationType: "PHYSICAL" as const,
  locationName: "Salle des fêtes",
  city: "Lille",
  country: "FR",
};
async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.fr`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "FR", currency: "EUR", timezone: "Europe/Paris", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "Parterre", price: "0", quantity: 100 });
  // modèle « Salle des fêtes » à une rangée de 4 places, comme le test de l'éditeur du plan ; bloc décrit par l'éditeur
  await applySeatingTemplate(ctx, event.id, "hall", { rows: 1, seatsFirst: 4, seatsLast: 4, centerAisle: false, categories: 1 });
  await setSeatingMode(ctx, event.id, true);
  const block = (await seatingEditor(ctx, event.id)).blocks.find((b) => b.kind === "ROWS")!;
  const blockId = block.id;
  const seats = () =>
    db.seat.findMany({ where: { row: { blockId } }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true, status: true, distributorId: true } });
  const tm = await createDistributor(ctx, { kind: "TICKETMASTER" });
  return { ctx, eventId: event.id, block, blockId, seats, tm };
}

describe("places confiées à un réseau dans l'éditeur du plan", () => {
  it("bloc agrandi : les places confiées gardent leur réseau, la nouvelle place reste en vente", async () => {
    const { ctx, eventId, block, blockId, seats, tm } = await setup();
    const before = await seats();
    await setDistributorSeats(ctx, eventId, { distributorId: tm.id, seatIds: [before[0]!.id, before[1]!.id], assign: true });
    await saveSeatingBlock(ctx, eventId, { ...block, params: { ...block.params, seatsFirst: 5, seatsLast: 5 } } as never);
    const after = await seats();
    expect(after.map((s) => [s.status, s.distributorId])).toEqual([
      ["BLOCKED", tm.id],
      ["BLOCKED", tm.id],
      ["AVAILABLE", null],
      ["AVAILABLE", null],
      ["AVAILABLE", null],
    ]);
  });

  it("bloc qui porte un billet importé : il ne se recrée pas ; la place vendue par le réseau ne se débloque pas", async () => {
    const { ctx, eventId, block, blockId, seats, tm } = await setup();
    const [first] = await seats();
    await setDistributorSeats(ctx, eventId, { distributorId: tm.id, seatIds: [first!.id], assign: true });
    await db.externalTicket.create({ data: { eventId, distributorId: tm.id, code: `TM-${rid()}`, seatId: first!.id } });
    await expect(saveSeatingBlock(ctx, eventId, { ...block, params: { ...block.params, seatsFirst: 5, seatsLast: 5 } } as never)).rejects.toMatchObject({
      code: "SEATING_BLOCK_HAS_SALES",
    });
    await expect(updateSeat(ctx, eventId, first!.id, { blocked: false })).rejects.toMatchObject({ code: "SEAT_TAKEN" });
    expect((await seats())[0]).toMatchObject({ status: "BLOCKED", distributorId: tm.id });
  });

  it("place confiée débloquée à la main : elle revient à la vente en ligne, sans réseau", async () => {
    const { ctx, eventId, seats, tm } = await setup();
    const [first] = await seats();
    await setDistributorSeats(ctx, eventId, { distributorId: tm.id, seatIds: [first!.id], assign: true });
    await updateSeat(ctx, eventId, first!.id, { blocked: false });
    expect((await seats())[0]).toMatchObject({ status: "AVAILABLE", distributorId: null });
  });
});
