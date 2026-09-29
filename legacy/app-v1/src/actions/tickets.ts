"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ticketTypeSchema = z.object({
  name: z.string().min(1, "Nom requis").max(100),
  description: z.string().optional(),
  priceCents: z.coerce.number().int().min(0, "Prix invalide"),
  quantity: z.coerce.number().int().min(1).optional().nullable(),
  saleStartsAt: z.string().optional().nullable(),
  saleEndsAt: z.string().optional().nullable(),
  minPerOrder: z.coerce.number().int().min(1).default(1),
  maxPerOrder: z.coerce.number().int().min(1).max(100).default(10),
  isNominative: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

export async function createTicketTypeAction(
  eventId: string,
  organizationId: string,
  formData: FormData
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const raw = {
    name: formData.get("name"),
    description: formData.get("description"),
    priceCents: formData.get("priceCents"),
    quantity: formData.get("quantity") || null,
    saleStartsAt: formData.get("saleStartsAt"),
    saleEndsAt: formData.get("saleEndsAt"),
    minPerOrder: formData.get("minPerOrder") ?? "1",
    maxPerOrder: formData.get("maxPerOrder") ?? "10",
    isNominative: formData.get("isNominative") === "true",
    sortOrder: formData.get("sortOrder") ?? "0",
  };

  const parsed = ticketTypeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Données invalides.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { saleStartsAt, saleEndsAt, ...data } = parsed.data;

  // Parse custom fields from JSON string
  const customFieldsRaw = formData.get("customFields");
  let customFields = null;
  if (customFieldsRaw) {
    try {
      customFields = JSON.parse(customFieldsRaw as string);
    } catch {
      return { error: "Champs custom invalides." };
    }
  }

  const ticketType = await db.ticketType.create({
    data: {
      eventId,
      ...data,
      quantity: data.quantity ?? null,
      saleStartsAt: saleStartsAt ? new Date(saleStartsAt) : null,
      saleEndsAt: saleEndsAt ? new Date(saleEndsAt) : null,
      customFields: customFields ?? undefined,
    },
  });

  revalidatePath(`/dashboard`);
  return { success: true, ticketTypeId: ticketType.id };
}

export async function updateTicketTypeAction(
  ticketTypeId: string,
  organizationId: string,
  formData: FormData
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const tt = await db.ticketType.findUnique({
    where: { id: ticketTypeId },
    include: { event: true },
  });

  if (!tt || tt.event.organizationId !== organizationId) {
    return { error: "Ticket introuvable." };
  }

  // Cannot change price if sales have happened
  const hasSales = tt.quantitySold > 0;
  const newPrice = Number(formData.get("priceCents"));

  if (hasSales && newPrice !== tt.priceCents) {
    return { error: "Impossible de modifier le prix après des ventes." };
  }

  const raw = {
    name: formData.get("name"),
    description: formData.get("description"),
    priceCents: formData.get("priceCents"),
    quantity: formData.get("quantity") || null,
    saleStartsAt: formData.get("saleStartsAt"),
    saleEndsAt: formData.get("saleEndsAt"),
    minPerOrder: formData.get("minPerOrder") ?? "1",
    maxPerOrder: formData.get("maxPerOrder") ?? "10",
    isNominative: formData.get("isNominative") === "true",
    sortOrder: formData.get("sortOrder") ?? "0",
  };

  const parsed = ticketTypeSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données invalides." };

  const { saleStartsAt, saleEndsAt, ...data } = parsed.data;

  const customFieldsRaw = formData.get("customFields");
  let customFields = tt.customFields;
  if (customFieldsRaw !== null) {
    try {
      customFields = customFieldsRaw ? JSON.parse(customFieldsRaw as string) : null;
    } catch {
      return { error: "Champs custom invalides." };
    }
  }

  await db.ticketType.update({
    where: { id: ticketTypeId },
    data: {
      ...data,
      quantity: data.quantity ?? null,
      saleStartsAt: saleStartsAt ? new Date(saleStartsAt) : null,
      saleEndsAt: saleEndsAt ? new Date(saleEndsAt) : null,
      customFields: customFields ?? undefined,
    },
  });

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function hideTicketTypeAction(
  ticketTypeId: string,
  organizationId: string,
  hidden: boolean
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  await db.ticketType.update({
    where: { id: ticketTypeId },
    data: { status: hidden ? "HIDDEN" : "ACTIVE" },
  });

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function deleteTicketTypeAction(
  ticketTypeId: string,
  organizationId: string
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const tt = await db.ticketType.findUnique({
    where: { id: ticketTypeId },
    include: { event: true },
  });

  if (!tt || tt.event.organizationId !== organizationId) {
    return { error: "Ticket introuvable." };
  }

  if (tt.quantitySold > 0) {
    return { error: "Impossible de supprimer un ticket avec des ventes. Masquez-le à la place." };
  }

  await db.ticketType.delete({ where: { id: ticketTypeId } });

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function reorderTicketTypesAction(
  eventId: string,
  organizationId: string,
  orderedIds: string[]
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.ticketType.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  return { success: true };
}
