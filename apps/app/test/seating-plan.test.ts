import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelReservation, reserveOrder } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";
import { applySeatingTemplate, setSeatChoice, setSeatingMode } from "@/server/seating";

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(pro = true) {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({ data: { name: `Théâtre ${id}`, slug: `theatre-${id}`, subdomain: `theatre-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const event = await db.event.create({ data: { organizationId: org.id, slug: `piece-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Pièce ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 7 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: [{ name: "Carré or", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 0 }, { name: "Catégorie 1", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 1 }, { name: "Balcon", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 2 }] } }, include: { ticketTypes: { orderBy: { sortOrder: "asc" } } } });
  const plans = await getPlans();
  const ctx = { organization: { id: org.id }, user: { id: user.id }, features: (pro ? plans.pro : plans.free).features } as unknown as OrgContext;
  return { id, event, ctx, types: event.ticketTypes };
}

describe("plan de salle par modèle (section 9.9)", () => {
  it("théâtre : blocs, places placées, catégories reliées ; meilleures places ; sièges isolés refusés ; modèle protégé par les ventes", async () => {
    const { event, ctx, types } = await setup();
    expect(await applySeatingTemplate(ctx, event.id, "theatre")).toEqual({ blocks: 3, seats: 216 });
    const map = await db.seatingMap.findUniqueOrThrow({ where: { eventId: event.id }, include: { blocks: true, categories: { orderBy: { sortOrder: "asc" } } } });
    expect(map).toMatchObject({ template: "theatre", focusX: 0, focusY: -70 });
    expect(map.blocks.map((b) => b.kind).sort()).toEqual(["ROWS", "ROWS", "SHAPE"]);
    expect(await db.seat.count({ where: { row: { seatingMapId: map.id }, x: null } })).toBe(0);
    expect(await db.seat.count({ where: { row: { seatingMapId: map.id }, accessible: true } })).toBe(2);
    const mapped = await db.ticketType.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: "asc" }, select: { seatingCategoryId: true } });
    expect(mapped.map((t) => t.seatingCategoryId)).toEqual(map.categories.map((c) => c.id));

    await setSeatingMode(ctx, event.id, true);
    const r1 = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 2 }], locale: "fr" });
    const held = await db.seat.findMany({ where: { holdOrderId: r1.orderId }, include: { row: true } });
    expect(held.map((s) => s.row.name)).toEqual(["A", "A"]); // premier rang
    const nums = held.map((s) => Number(s.label));
    expect(nums.every((n) => n % 2 === nums[0]! % 2)).toBe(true); // même côté de l'allée (impairs ou pairs)
    expect(Math.abs(nums[0]! - nums[1]!)).toBe(2); // voisines

    // RG-SEAT-01 : une place seule entre le choix et l'allée est refusée, tant qu'un autre choix l'évite
    await setSeatChoice(ctx, event.id, true);
    const rowB = await db.seatingRow.findFirstOrThrow({ where: { seatingMapId: map.id, name: "B" }, include: { seats: true } });
    const seat = (label: string) => rowB.seats.find((s) => s.label === label)!.id;
    await expect(reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", seatIds: [seat("3")] })).rejects.toThrow("SEAT_ORPHAN");
    const r2 = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: types[0]!.id, quantity: 1 }], locale: "fr", seatIds: [seat("1")] });
    expect(await db.seat.count({ where: { holdOrderId: r2.orderId } })).toBe(1);

    // RG-SEAT-02 : pas de nouveau modèle tant que des places sont retenues ou vendues
    await expect(applySeatingTemplate(ctx, event.id, "hall")).rejects.toThrow("SEATING_HAS_SALES");
    await cancelReservation(r1.token);
    await cancelReservation(r2.token);
    expect((await applySeatingTemplate(ctx, event.id, "hall")).seats).toBe(12 * 20);
  });

  it("stade de foot : 4 000 places en quatre tribunes ; offre gratuite refusée", async () => {
    const { event, ctx } = await setup();
    expect(await applySeatingTemplate(ctx, event.id, "stadium")).toEqual({ blocks: 5, seats: 4000 });
    const free = await setup(false);
    await expect(applySeatingTemplate(free.ctx, free.event.id, "theatre")).rejects.toThrow("PRO_REQUIRED");
  });
});
