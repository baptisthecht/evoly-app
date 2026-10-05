import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";
import { applySeatingTemplate, friendCodeFor, friendSeats, setSeatingMode } from "@/server/seating";
import { moveTicketSeat, seatOccupancy, updateSeat } from "@/server/seatingEditor";
import { applySeatingLayout, deleteSeatingLayout, listSeatingLayouts, saveSeatingLayout } from "@/server/seatingLayouts";

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup() {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Salle ${id}`, slug: `salle-${id}`, subdomain: `salle-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `bal-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Bal ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 9 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: {
        create: [
          { name: "Parterre", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 0 },
          { name: "Fond", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 1 },
        ],
      },
    },
    include: { ticketTypes: { orderBy: { sortOrder: "asc" } } },
  });
  const ctx = { organization: { id: org.id }, user: { id: user.id }, features: (await getPlans()).pro.features } as unknown as OrgContext;
  return { id, event, ctx, types: event.ticketTypes };
}
const buy = async (eventId: string, ticketTypeId: string, n: number, who: string, nearCode?: string) => {
  const r = await reserveOrder({ eventId, lines: [{ ticketTypeId, quantity: n }], locale: "fr", nearCode });
  await submitBuyer(r.token, { firstName: who, lastName: "Martin", email: `${who.toLowerCase()}.${rid()}@exemple.be`, marketingOptIn: false });
  return r.orderId;
};
const seatsOf = async (orderId: string) =>
  (await db.ticket.findMany({ where: { orderId }, include: { seat: { include: { row: true } } } })).map((t) => t.seat!);

describe("plan de salle, phase 2 (section 9.9)", () => {
  it("changer un acheteur de place, plan d'occupation, réserver à côté de ses amis", async () => {
    const { event, ctx, types } = await setup();
    await applySeatingTemplate(ctx, event.id, "hall", { rows: 4, seatsFirst: 8, seatsLast: 8, centerAisle: false, categories: 2 });
    await setSeatingMode(ctx, event.id, true);
    const lea = await buy(event.id, types[0]!.id, 2, "Léa");
    const [seat] = await seatsOf(lea);

    // changement de place : même catégorie, place libre ; e-mail au titulaire
    const free = await db.seat.findFirstOrThrow({
      where: { categoryId: seat!.categoryId, status: "AVAILABLE" },
      orderBy: [{ row: { sortOrder: "desc" } }, { sortOrder: "desc" }],
    });
    await moveTicketSeat(ctx, event.id, seat!.id, free.id);
    expect((await db.seat.findUniqueOrThrow({ where: { id: seat!.id } })).status).toBe("AVAILABLE");
    expect((await db.seat.findUniqueOrThrow({ where: { id: free.id } })).status).toBe("SOLD");
    expect((await db.ticket.findFirstOrThrow({ where: { seatId: free.id } })).orderId).toBe(lea);
    expect(await db.emailMessage.count({ where: { template: "seating.seat_changed", organizationId: ctx.organization.id } })).toBe(1);
    const other = await db.seat.findFirstOrThrow({
      where: {
        row: { seatingMapId: (await db.seatingMap.findUniqueOrThrow({ where: { eventId: event.id } })).id },
        categoryId: { not: seat!.categoryId },
        status: "AVAILABLE",
      },
    });
    await expect(moveTicketSeat(ctx, event.id, free.id, other.id)).rejects.toThrow("SEAT_CATEGORY_MISMATCH");
    const leaSeats = await seatsOf(lea);
    await expect(moveTicketSeat(ctx, event.id, leaSeats[0]!.id, leaSeats[1]!.id)).rejects.toThrow("SEAT_TAKEN");

    // plan d'occupation : vendues, puis entrée scannée
    let occ = (await seatOccupancy(ctx, event.id))!;
    expect(occ.counts).toMatchObject({ total: 32, sold: 2, entered: 0 });
    await db.ticket.updateMany({ where: { orderId: lea, seatId: free.id }, data: { checkedInAt: new Date() } });
    occ = (await seatOccupancy(ctx, event.id))!;
    expect(occ.counts.entered).toBe(1);
    expect(occ.seats.find((s) => s.id === free.id)).toMatchObject({ state: "IN", holder: "Léa M." });

    // à côté de ses amis : le prénom seulement, et des places dans le même rang que l'ami
    const code = (await friendCodeFor(lea))!;
    expect(code).toMatch(/^[a-z0-9]{10}$/);
    expect(await friendCodeFor(lea)).toBe(code);
    const friend = (await friendSeats(event.id, code))!;
    expect(friend).toMatchObject({ firstName: "Léa" });
    expect(friend.seatIds).toHaveLength(2);
    expect(await friendSeats(event.id, "inconnu123")).toBeNull();
    const hugo = await buy(event.id, types[0]!.id, 1, "Hugo", code);
    const hugoSeat = (await seatsOf(hugo))[0]!;
    const leaRows = new Set((await seatsOf(lea)).map((s) => s.row.name));
    expect(leaRows.has(hugoSeat.row.name)).toBe(true);
  });

  it("bibliothèque : salle enregistrée avec ses places particulières, partagée, appliquée par un autre organisateur", async () => {
    const a = await setup();
    await applySeatingTemplate(a.ctx, a.event.id, "hall", { rows: 3, seatsFirst: 6, seatsLast: 6, centerAisle: false, categories: 1 });
    const seats = await db.seat.findMany({ where: { row: { seatingMap: { eventId: a.event.id }, name: "A" } }, orderBy: { sortOrder: "asc" } });
    await updateSeat(a.ctx, a.event.id, seats[0]!.id, { label: "1 bis", blocked: true });
    await updateSeat(a.ctx, a.event.id, seats[5]!.id, { accessible: true, note: "Accès rampe" });
    const name = `Salle communale ${a.id}`;
    const layoutId = await saveSeatingLayout(a.ctx, a.event.id, { name, city: "Mouscron", shared: true });

    const b = await setup();
    const found = await listSeatingLayouts(b.ctx, a.id);
    expect(found).toEqual([expect.objectContaining({ id: layoutId, name, city: "Mouscron", seatCount: 18, shared: true, mine: false })]);
    expect((await applySeatingLayout(b.ctx, b.event.id, layoutId)).seats).toBe(18);
    const rowA = await db.seat.findMany({ where: { row: { seatingMap: { eventId: b.event.id }, name: "A" } }, orderBy: { sortOrder: "asc" } });
    expect(rowA[0]).toMatchObject({ label: "1 bis", status: "BLOCKED" });
    expect(rowA[5]).toMatchObject({ accessible: true, note: "Accès rampe" });
    await expect(deleteSeatingLayout(b.ctx, layoutId)).rejects.toThrow("NOT_FOUND");
    await deleteSeatingLayout(a.ctx, layoutId);
    expect(await listSeatingLayouts(b.ctx, a.id)).toEqual([]);
  });
});
