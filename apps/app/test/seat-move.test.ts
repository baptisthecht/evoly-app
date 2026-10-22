import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createEvent, publishEvent } from "@/server/events";
import { addRow, saveCategory, setSeatingMode } from "@/server/seating";
import { moveTicketSeat } from "@/server/seatingEditor";

// déplacement d'un billet par l'organisateur (section 9.9) : place libérée, e-mail dans la langue de l'acheteur, refus
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
async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "Parterre", price: "0", quantity: 100 });
  const ticketTypeId = (await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })).id;
  const cat = await saveCategory(ctx, event.id, { name: "Parterre", color: "#ffb8e8", ticketTypeId });
  const balcony = await saveCategory(ctx, event.id, { name: "Balcon", color: "#123456", ticketTypeId: null });
  const row = await addRow(ctx, event.id, { categoryId: cat.id, name: "A", seats: "4" });
  const up = await addRow(ctx, event.id, { categoryId: balcony.id, name: "B", seats: "2" });
  await setSeatingMode(ctx, event.id, true);
  await publishEvent(ctx, event.id);
  const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId, quantity: 1 }], locale: "nl" });
  await submitBuyer(r.token, { firstName: "Daan", lastName: "Peeters", email: `daan.${id}@exemple.be`, marketingOptIn: false });
  const ticket = await db.ticket.findFirstOrThrow({ where: { eventId: event.id } });
  const seats = await db.seat.findMany({ where: { rowId: row.id }, orderBy: { sortOrder: "asc" } });
  const upper = await db.seat.findMany({ where: { rowId: up.id } });
  return { ctx, event, ticket, seats, upper };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("déplacement d'un billet", () => {
  it("le billet change de place, l'ancienne est libérée ; e-mail en néerlandais, rattaché à la commande", async () => {
    const { ctx, event, ticket, seats } = await setup();
    const from = ticket.seatId!;
    const to = seats.find((s) => s.id !== from && s.status === "AVAILABLE")!;
    await moveTicketSeat(ctx, event.id, from, to.id);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).seatId).toBe(to.id);
    expect((await db.seat.findUniqueOrThrow({ where: { id: from } })).status).toBe("AVAILABLE");
    expect((await db.seat.findUniqueOrThrow({ where: { id: to.id } })).status).toBe("SOLD");
    const mail = await db.emailMessage.findFirstOrThrow({ where: { orderId: ticket.orderId, template: "seating.seat_changed" } });
    expect(mail.locale).toBe("nl");
  });

  it("place inconnue, non vendue, déjà prise ou d'une autre catégorie : refusé", async () => {
    const { ctx, event, ticket, seats, upper } = await setup();
    const from = ticket.seatId!;
    const free = seats.filter((s) => s.id !== from);
    await expect(moveTicketSeat(ctx, event.id, "place-inconnue", free[0]!.id)).rejects.toEqual(refused("NOT_FOUND"));
    await expect(moveTicketSeat(ctx, event.id, free[0]!.id, free[1]!.id)).rejects.toEqual(refused("SEAT_NOT_SOLD"));
    await expect(moveTicketSeat(ctx, event.id, from, upper[0]!.id)).rejects.toEqual(refused("SEAT_CATEGORY_MISMATCH"));
    await db.seat.update({ where: { id: free[0]!.id }, data: { status: "SOLD" } });
    await expect(moveTicketSeat(ctx, event.id, from, free[0]!.id)).rejects.toEqual(refused("SEAT_TAKEN"));
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).seatId).toBe(from);
  });
});
