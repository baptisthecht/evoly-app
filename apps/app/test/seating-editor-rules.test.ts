import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createEvent } from "@/server/events";
import { addRow, saveCategory } from "@/server/seating";
import { deleteSeatingBlock, updateSeat, updateSeatingCategory } from "@/server/seatingEditor";

// éditeur de plan de salle (Pro) : places (libellé, blocage, mobilité réduite, note) et catégories (tarifs reliés)
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
  const cat = await saveCategory(ctx, event.id, { name: "Parterre", color: "#ffb8e8", ticketTypeId: null });
  const row = await addRow(ctx, event.id, { categoryId: cat.id, name: "A", seats: "3" });
  const seats = await db.seat.findMany({ where: { rowId: row.id }, orderBy: { sortOrder: "asc" } });
  return { ctx, event, ticketTypeId, cat, seats };
}
const refused = (code: string) => expect.objectContaining({ code });
const seat = (id: string) => db.seat.findUniqueOrThrow({ where: { id } });

describe("éditeur de plan : une place", () => {
  it("libellé vide, trop long ou déjà pris dans le rang refusé ; renommée, bloquée, mobilité réduite et note (80 caractères)", async () => {
    const { ctx, event, seats } = await setup();
    const [a, b] = seats;
    await expect(updateSeat(ctx, event.id, "place-inconnue", { label: "9" })).rejects.toEqual(refused("NOT_FOUND"));
    await expect(updateSeat(ctx, event.id, a!.id, { label: "   " })).rejects.toEqual(refused("SEAT_LABEL_INVALID"));
    await expect(updateSeat(ctx, event.id, a!.id, { label: "trop-long-123" })).rejects.toEqual(refused("SEAT_LABEL_INVALID"));
    await expect(updateSeat(ctx, event.id, a!.id, { label: b!.label })).rejects.toEqual(refused("SEAT_LABEL_TAKEN"));
    await updateSeat(ctx, event.id, a!.id, { label: " 1 bis ", blocked: true, accessible: true, note: `  ${"Pilier devant ".repeat(10)}` });
    const after = await seat(a!.id);
    expect(after).toMatchObject({ label: "1 bis", status: "BLOCKED", accessible: true });
    expect(after.note).toHaveLength(80);
    await updateSeat(ctx, event.id, a!.id, { blocked: false, note: "  " });
    expect(await seat(a!.id)).toMatchObject({ status: "AVAILABLE", note: null });
  });

  it("place vendue : ni libellé ni état modifiables ; note et mobilité réduite restent modifiables", async () => {
    const { ctx, event, seats } = await setup();
    const sold = seats[2]!;
    await db.seat.update({ where: { id: sold.id }, data: { status: "SOLD" } });
    await expect(updateSeat(ctx, event.id, sold.id, { label: "99" })).rejects.toEqual(refused("SEAT_TAKEN"));
    await expect(updateSeat(ctx, event.id, sold.id, { blocked: true })).rejects.toEqual(refused("SEAT_TAKEN"));
    await updateSeat(ctx, event.id, sold.id, { label: sold.label, accessible: true, note: "Fauteuil roulant" });
    expect(await seat(sold.id)).toMatchObject({ status: "SOLD", label: sold.label, accessible: true, note: "Fauteuil roulant" });
  });
});

describe("éditeur de plan : catégories et blocs", () => {
  it("catégorie inconnue introuvable ; couleur invalide refusée ; tarifs reliés puis déliés", async () => {
    const { ctx, event, cat, ticketTypeId } = await setup();
    await expect(updateSeatingCategory(ctx, event.id, "categorie-inconnue", { name: "Balcon", color: "#000000", ticketTypeIds: [] })).rejects.toEqual(
      refused("NOT_FOUND"),
    );
    await expect(updateSeatingCategory(ctx, event.id, cat.id, { name: "Balcon", color: "noir", ticketTypeIds: [] })).rejects.toEqual(
      refused("SEATING_CATEGORY_INVALID"),
    );
    await updateSeatingCategory(ctx, event.id, cat.id, { name: " Balcon ", color: "#123456", ticketTypeIds: [ticketTypeId] });
    expect(await db.seatingCategory.findUniqueOrThrow({ where: { id: cat.id } })).toMatchObject({ name: "Balcon", color: "#123456" });
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).seatingCategoryId).toBe(cat.id);
    await updateSeatingCategory(ctx, event.id, cat.id, { name: "Balcon", color: "#123456", ticketTypeIds: [] });
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).seatingCategoryId).toBeNull();
  });

  it("bloc inconnu : suppression refusée", async () => {
    const { ctx, event } = await setup();
    await expect(deleteSeatingBlock(ctx, event.id, "bloc-inconnu")).rejects.toEqual(refused("NOT_FOUND"));
  });
});
