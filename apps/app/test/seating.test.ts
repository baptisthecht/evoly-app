import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelReservation, releaseExpiredHolds, reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";
import { addRow, deleteRow, saveCategory, setSeatChoice, setSeatingMode, toggleSeatBlocked } from "@/server/seating";

const rid = () => Math.random().toString(36).slice(2, 10);
const seatsOf = async (orderId: string) => (await db.ticket.findMany({ where: { orderId }, include: { seat: { include: { row: true } } } })).map((t) => `${t.seat?.row.name}${t.seat?.label}`).sort();

describe("plan de salle (section 9.9, RG-SEAT-01 et 02)", () => {
  it("meilleures places côte à côte, retenues avec le panier, attribuées aux billets, libérées à l'annulation et à l'expiration", async () => {
    const id = rid();
    const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
    const org = await db.organization.create({ data: { name: `Théâtre ${id}`, slug: `theatre-${id}`, subdomain: `theatre-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
    const event = await db.event.create({ data: { organizationId: org.id, slug: `piece-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Pièce ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 7 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: [{ name: "Carré", priceMinor: 0, currency: "EUR", quantity: 8, sortOrder: 0 }, { name: "Balcon", priceMinor: 0, currency: "EUR", quantity: 3, sortOrder: 1 }] } }, include: { ticketTypes: { orderBy: { sortOrder: "asc" } } } });
    const [carre, balcon] = event.ticketTypes;
    const ctx = { organization: { id: org.id }, user: { id: user.id }, features: (await getPlans()).pro.features } as unknown as OrgContext;
    await expect(setSeatingMode(ctx, event.id, true)).rejects.toThrow("SEATING_TYPES_UNMAPPED");
    const catA = await saveCategory(ctx, event.id, { name: "Carré", color: "#FFB8E8", ticketTypeId: carre!.id });
    const catB = await saveCategory(ctx, event.id, { name: "Balcon", color: "#F3D9F0", ticketTypeId: balcon!.id });
    const rowA = await addRow(ctx, event.id, { categoryId: catA.id, name: "A", seats: "4" });
    await addRow(ctx, event.id, { categoryId: catA.id, name: "B", seats: "4" });
    await addRow(ctx, event.id, { categoryId: catB.id, name: "C", seats: "1, 2, 3" });
    await setSeatingMode(ctx, event.id, true);
    await toggleSeatBlocked(ctx, event.id, (await db.seat.findFirstOrThrow({ where: { rowId: rowA.id, label: "2" } })).id);

    const buyer = { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false };
    const r1 = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: carre!.id, quantity: 2 }], locale: "fr" });
    expect(await db.seat.count({ where: { holdOrderId: r1.orderId, status: "HELD" } })).toBe(2);
    await submitBuyer(r1.token, buyer);
    expect(await seatsOf(r1.orderId)).toEqual(["A3", "A4"]); // A2 bloqué : A3 et A4 côte à côte
    expect(await db.seat.count({ where: { holdOrderId: r1.orderId, status: "SOLD" } })).toBe(2);

    const r2 = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: carre!.id, quantity: 3 }], locale: "fr" });
    expect((await db.seat.findMany({ where: { holdOrderId: r2.orderId }, include: { row: true } })).map((s) => `${s.row.name}${s.label}`).sort()).toEqual(["B1", "B2", "B3"]);
    await cancelReservation(r2.token);
    expect(await db.seat.count({ where: { holdOrderId: r2.orderId } })).toBe(0);

    const r3 = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: balcon!.id, quantity: 3 }], locale: "fr" });
    expect(await db.seat.count({ where: { holdOrderId: r3.orderId, status: "HELD" } })).toBe(3);
    await releaseExpiredHolds(new Date(Date.now() + 3 * 3_600_000));
    expect(await db.seat.count({ where: { categoryId: catB.id, status: "AVAILABLE" } })).toBe(3);

    await expect(deleteRow(ctx, event.id, rowA.id)).rejects.toThrow("SEATING_ROW_SOLD");
    const sold = await db.seat.findFirstOrThrow({ where: { holdOrderId: r1.orderId } });
    await expect(toggleSeatBlocked(ctx, event.id, sold.id)).rejects.toThrow("SEAT_NOT_EDITABLE");
  });

  it("places choisies par l'acheteur : exactement celles-là ; place prise ou mauvais nombre refusés", async () => {
    const id = rid();
    const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
    const org = await db.organization.create({ data: { name: `Opéra ${id}`, slug: `opera-${id}`, subdomain: `opera-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
    const event = await db.event.create({ data: { organizationId: org.id, slug: `tosca-${id}`, publicCode: `T${id}`.toUpperCase().slice(0, 8), title: `Tosca ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 7 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: { name: "Parterre", priceMinor: 0, currency: "EUR", quantity: 10 } } }, include: { ticketTypes: true } });
    const ctx = { organization: { id: org.id }, user: { id: user.id }, features: (await getPlans()).pro.features } as unknown as OrgContext;
    const cat = await saveCategory(ctx, event.id, { name: "Parterre", color: "#FFB8E8", ticketTypeId: event.ticketTypes[0]!.id });
    const row = await addRow(ctx, event.id, { categoryId: cat.id, name: "A", seats: "5" });
    await setSeatingMode(ctx, event.id, true);
    await setSeatChoice(ctx, event.id, true);
    const seat = async (label: string) => (await db.seat.findFirstOrThrow({ where: { rowId: row.id, label } })).id;
    const line = [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 2 }];
    // 2 et 5 laisseraient la place 1 seule en bout de rang : refusé (un autre choix l'évite)
    await expect(reserveOrder({ eventId: event.id, lines: line, locale: "fr", seatIds: [await seat("2"), await seat("5")] })).rejects.toThrow("SEAT_ORPHAN");
    const r = await reserveOrder({ eventId: event.id, lines: line, locale: "fr", seatIds: [await seat("1"), await seat("5")] });
    expect((await db.seat.findMany({ where: { holdOrderId: r.orderId }, orderBy: { label: "asc" } })).map((x) => x.label)).toEqual(["1", "5"]);
    await expect(reserveOrder({ eventId: event.id, lines: line, locale: "fr", seatIds: [await seat("5"), await seat("2")] })).rejects.toThrow("SEAT_TAKEN");
    await expect(reserveOrder({ eventId: event.id, lines: line, locale: "fr", seatIds: [await seat("1")] })).rejects.toThrow("SEATS_MISMATCH");
    expect(await db.seat.count({ where: { rowId: row.id, status: "HELD" } })).toBe(2); // les refus ne retiennent rien
  });
});

