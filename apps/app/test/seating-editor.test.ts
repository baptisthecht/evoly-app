import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { OrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";
import { applySeatingTemplate } from "@/server/seating";
import { deleteSeatingBlock, saveSeatingBlock, seatingEditor, updateSeat, updateSeatingCategory } from "@/server/seatingEditor";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("éditeur du plan de salle (section 9.9)", () => {
  it("déplacer, restructurer, protéger les places vendues, modifier places et catégories, ajouter et supprimer un bloc", async () => {
    const id = rid();
    const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
    const org = await db.organization.create({ data: { name: `Salle ${id}`, slug: `salle-${id}`, subdomain: `salle-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
    const event = await db.event.create({ data: { organizationId: org.id, slug: `bal-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Bal ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 9 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: [{ name: "Adulte", priceMinor: 0, currency: "EUR", quantity: 400, sortOrder: 0 }, { name: "Enfant", priceMinor: 0, currency: "EUR", quantity: 400, sortOrder: 1 }] } }, include: { ticketTypes: { orderBy: { sortOrder: "asc" } } } });
    const ctx = { organization: { id: org.id }, user: { id: user.id }, features: (await getPlans()).pro.features } as unknown as OrgContext;
    await applySeatingTemplate(ctx, event.id, "hall", { rows: 4, seatsFirst: 6, seatsLast: 6, centerAisle: false, categories: 1 });
    let st = await seatingEditor(ctx, event.id);
    const rows = st.blocks.find((b) => b.kind === "ROWS")!;
    const stage = st.blocks.find((b) => b.kind === "SHAPE")!;
    const seatA1 = st.seats.find((s) => s.row === "A" && s.label === "1")!;

    // déplacement : mêmes places, décalées
    await saveSeatingBlock(ctx, event.id, { ...rows, x: rows.x + 100 });
    st = await seatingEditor(ctx, event.id);
    expect(st.seats.find((s) => s.id === seatA1.id)!.x).toBeCloseTo(seatA1.x + 100);

    // restructuration : bloquée, mobilité réduite et note conservées
    await updateSeat(ctx, event.id, seatA1.id, { blocked: true, note: "Régie" });
    const seatB2 = st.seats.find((s) => s.row === "B" && s.label === "2")!;
    await updateSeat(ctx, event.id, seatB2.id, { accessible: true });
    const moved = st.blocks.find((b) => b.id === rows.id)!;
    await saveSeatingBlock(ctx, event.id, { ...moved, params: { ...moved.params, rows: 3, seatsFirst: 8, seatsLast: 8 } });
    st = await seatingEditor(ctx, event.id);
    expect(st.seats.filter((s) => s.blockId === rows.id)).toHaveLength(24);
    expect(st.seats.find((s) => s.row === "A" && s.label === "1")).toMatchObject({ status: "BLOCKED", note: "Régie" });
    expect(st.seats.find((s) => s.row === "B" && s.label === "2")!.accessible).toBe(true);

    // place vendue : structure figée, déplacement permis, place conservée
    const sold = st.seats.find((s) => s.row === "C" && s.label === "4")!;
    await db.seat.update({ where: { id: sold.id }, data: { status: "SOLD" } });
    const current = st.blocks.find((b) => b.id === rows.id)!;
    await expect(saveSeatingBlock(ctx, event.id, { ...current, params: { ...current.params, rows: 2 } })).rejects.toThrow("SEATING_BLOCK_HAS_SALES");
    await saveSeatingBlock(ctx, event.id, { ...current, y: current.y + 50 });
    expect((await db.seat.findUniqueOrThrow({ where: { id: sold.id } })).status).toBe("SOLD");
    await expect(updateSeat(ctx, event.id, sold.id, { label: "4 bis" })).rejects.toThrow("SEAT_TAKEN");
    await expect(deleteSeatingBlock(ctx, event.id, rows.id)).rejects.toThrow("SEATING_BLOCK_HAS_SALES");
    await expect(updateSeat(ctx, event.id, st.seats.find((s) => s.row === "C" && s.label === "1")!.id, { label: "2" })).rejects.toThrow("SEAT_LABEL_TAKEN");
    await updateSeat(ctx, event.id, st.seats.find((s) => s.row === "C" && s.label === "1")!.id, { label: "1 bis" });

    // catégorie : nom, couleur, tarifs reliés
    const cat = st.categories[0]!;
    await updateSeatingCategory(ctx, event.id, cat.id, { name: "Parterre", color: "#A9C4F2", ticketTypeIds: [event.ticketTypes[0]!.id] });
    st = await seatingEditor(ctx, event.id);
    expect(st.categories[0]).toMatchObject({ name: "Parterre", color: "#A9C4F2", ticketTypeIds: [event.ticketTypes[0]!.id] });
    expect(st.ticketTypes.find((t) => t.id === event.ticketTypes[1]!.id)!.categoryId).toBeNull();

    // nouveau bloc puis suppression ; point focal qui suit la scène
    const tables = await saveSeatingBlock(ctx, event.id, { kind: "TABLE_ROUND", name: "Tables", x: 0, y: 400, rotation: 0, params: { tables: 2, seats: 6, perRow: 2, tableGap: 30, labelStart: 1, category: cat.id } });
    expect(await db.seat.count({ where: { row: { blockId: tables } } })).toBe(12);
    await deleteSeatingBlock(ctx, event.id, tables);
    expect(await db.seat.count({ where: { row: { blockId: tables } } })).toBe(0);
    await saveSeatingBlock(ctx, event.id, { ...stage, x: 40, y: -120 });
    expect((await seatingEditor(ctx, event.id)).focus).toEqual({ x: 40, y: -120 });
  });
});
