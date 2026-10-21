import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createEvent } from "@/server/events";
import { addRow, deleteRow, saveCategory, setSeatChoice, setSeatingMode, toggleSeatBlocked } from "@/server/seating";

// plan de salle (section 9.9, RG-SEAT-02, Pro) : catégories, rangs, sièges bloqués, placement numéroté
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
async function setup(o: { pro?: boolean } = {}) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (o.pro !== false)
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) },
    });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "Parterre", price: "0", quantity: 100 });
  const ticketTypeId = (await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })).id;
  return { ctx, event, ticketTypeId };
}
const refused = (code: string) => expect.objectContaining({ code });
const seatsOf = (rowId: string) => db.seat.findMany({ where: { rowId }, orderBy: { sortOrder: "asc" } });

describe("plan de salle (Pro)", () => {
  it("offre gratuite : catégories, placement numéroté et choix des places refusés", async () => {
    const { ctx, event, ticketTypeId } = await setup({ pro: false });
    await expect(saveCategory(ctx, event.id, { name: "Parterre", color: "#ffb8e8", ticketTypeId })).rejects.toEqual(refused("PRO_REQUIRED"));
    await expect(setSeatingMode(ctx, event.id, true)).rejects.toEqual(refused("PRO_REQUIRED"));
    await expect(setSeatChoice(ctx, event.id, true)).rejects.toEqual(refused("PRO_REQUIRED"));
  });

  it("catégorie : nom vide ou couleur invalide refusés ; rattachée au tarif", async () => {
    const { ctx, event, ticketTypeId } = await setup();
    await expect(saveCategory(ctx, event.id, { name: "  ", color: "#ffb8e8", ticketTypeId: null })).rejects.toEqual(refused("SEATING_CATEGORY_INVALID"));
    await expect(saveCategory(ctx, event.id, { name: "Balcon", color: "rose", ticketTypeId: null })).rejects.toEqual(refused("SEATING_CATEGORY_INVALID"));
    const cat = await saveCategory(ctx, event.id, { name: "Parterre", color: "#ffb8e8", ticketTypeId });
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).seatingCategoryId).toBe(cat.id);
  });

  it("rangs : sans nom ni sièges refusés, catégorie inconnue introuvable ; rang avec une place retenue : non supprimable", async () => {
    const { ctx, event } = await setup();
    const cat = await saveCategory(ctx, event.id, { name: "Parterre", color: "#ffb8e8", ticketTypeId: null });
    await expect(addRow(ctx, event.id, { categoryId: cat.id, name: "", seats: "6" })).rejects.toEqual(refused("SEATING_ROW_INVALID"));
    await expect(addRow(ctx, event.id, { categoryId: cat.id, name: "A", seats: "" })).rejects.toEqual(refused("SEATING_ROW_INVALID"));
    await expect(addRow(ctx, event.id, { categoryId: "categorie-inconnue", name: "A", seats: "6" })).rejects.toEqual(refused("NOT_FOUND"));
    const row = await addRow(ctx, event.id, { categoryId: cat.id, name: "A", seats: "6" });
    const seats = await seatsOf(row.id);
    expect(seats).toHaveLength(6);
    await db.seat.update({ where: { id: seats[0]!.id }, data: { status: "HELD" } });
    await expect(deleteRow(ctx, event.id, row.id)).rejects.toEqual(refused("SEATING_ROW_SOLD"));
    await expect(deleteRow(ctx, event.id, "rang-inconnu")).rejects.toEqual(refused("NOT_FOUND"));
    const empty = await addRow(ctx, event.id, { categoryId: cat.id, name: "B", seats: "4" });
    await deleteRow(ctx, event.id, empty.id);
    expect(await db.seatingRow.count({ where: { id: empty.id } })).toBe(0);
  });

  it("siège : bloqué puis débloqué ; vendu ou inconnu : non modifiable", async () => {
    const { ctx, event } = await setup();
    const cat = await saveCategory(ctx, event.id, { name: "Parterre", color: "#ffb8e8", ticketTypeId: null });
    const row = await addRow(ctx, event.id, { categoryId: cat.id, name: "A", seats: "3" });
    const [first, second] = await seatsOf(row.id);
    await toggleSeatBlocked(ctx, event.id, first!.id);
    expect((await db.seat.findUniqueOrThrow({ where: { id: first!.id } })).status).toBe("BLOCKED");
    await toggleSeatBlocked(ctx, event.id, first!.id);
    expect((await db.seat.findUniqueOrThrow({ where: { id: first!.id } })).status).toBe("AVAILABLE");
    await db.seat.update({ where: { id: second!.id }, data: { status: "SOLD" } });
    await expect(toggleSeatBlocked(ctx, event.id, second!.id)).rejects.toEqual(refused("SEAT_NOT_EDITABLE"));
    await expect(toggleSeatBlocked(ctx, event.id, "siege-inconnu")).rejects.toEqual(refused("SEAT_NOT_EDITABLE"));
  });

  it("placement numéroté : refusé tant qu'un tarif n'a pas de catégorie ; le désactiver remet à « non » le choix des places", async () => {
    const { ctx, event, ticketTypeId } = await setup();
    await expect(setSeatingMode(ctx, event.id, true)).rejects.toEqual(refused("SEATING_TYPES_UNMAPPED"));
    await saveCategory(ctx, event.id, { name: "Parterre", color: "#ffb8e8", ticketTypeId });
    await setSeatingMode(ctx, event.id, true);
    await setSeatChoice(ctx, event.id, true);
    expect(await db.event.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ seatingMode: "ASSIGNED", allowSeatChoice: true });
    await setSeatingMode(ctx, event.id, false);
    expect(await db.event.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ seatingMode: "GENERAL_ADMISSION", allowSeatChoice: false });
  });
});
