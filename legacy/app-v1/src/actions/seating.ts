"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ── Public: fetch available seats for buyer seat picker ────────────────────────

export async function getPublicSeatingMapAction(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId, status: "PUBLISHED" },
    select: {
      allowSeatChoice: true,
      seatingType: true,
      seatingMap: {
        include: {
          categories: true,
          rows: {
            include: { seats: { orderBy: [{ label: "asc" }] } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!event || event.seatingType !== "ASSIGNED" || !event.allowSeatChoice) {
    return null;
  }

  if (!event.seatingMap) return null;

  return {
    id: event.seatingMap.id,
    categories: event.seatingMap.categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      ticketTypeId: c.ticketTypeId,
    })),
    rows: event.seatingMap.rows.map((r) => ({
      id: r.id,
      name: r.name,
      categoryId: r.categoryId,
      seats: r.seats.map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status as "AVAILABLE" | "RESERVED" | "SOLD" | "BLOCKED",
        categoryId: s.categoryId,
      })),
    })),
  };
}

export async function createSeatingMapAction(eventId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { organizationId: true, seatingMap: { select: { id: true } } },
  });
  if (!event) return { error: "Événement introuvable." };
  if (event.seatingMap) return { error: "Un plan de salle existe déjà." };

  await db.seatingMap.create({ data: { eventId } });
  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function addCategoryAction(
  seatingMapId: string,
  name: string,
  color: string,
  ticketTypeId: string | null
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await db.seatingCategory.create({
    data: { seatingMapId, name, color, ticketTypeId },
  });
  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function addRowAction(
  seatingMapId: string,
  categoryId: string,
  rowName: string,
  seatCount: number
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  if (seatCount < 1 || seatCount > 200) return { error: "Nombre de sièges invalide (1-200)." };

  const existingRows = await db.seatingRow.count({ where: { seatingMapId } });

  const row = await db.seatingRow.create({
    data: {
      seatingMapId,
      categoryId,
      name: rowName.trim(),
      sortOrder: existingRows,
    },
  });

  // Create seats
  const seats = Array.from({ length: seatCount }, (_, i) => ({
    rowId: row.id,
    categoryId,
    label: `${rowName.trim()}${String(i + 1).padStart(2, "0")}`,
    status: "AVAILABLE" as const,
  }));

  await db.seat.createMany({ data: seats });

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function toggleSeatChoiceAction(eventId: string, allowSeatChoice: boolean) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await db.event.update({
    where: { id: eventId },
    data: { allowSeatChoice },
  });
  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function blockSeatAction(seatId: string, status: "AVAILABLE" | "BLOCKED") {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  const seat = await db.seat.findUnique({ where: { id: seatId } });
  if (!seat) return { error: "Siège introuvable." };
  if (seat.status === "SOLD" || seat.status === "RESERVED") {
    return { error: "Impossible de modifier un siège vendu ou réservé." };
  }

  await db.seat.update({ where: { id: seatId }, data: { status } });
  return { success: true };
}
