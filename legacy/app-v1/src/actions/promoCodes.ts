"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const promoCodeSchema = z.object({
  code: z.string().min(1).max(50).toUpperCase(),
  type: z.enum(["PERCENTAGE", "FIXED", "FREE"]),
  value: z.coerce.number().min(0),
  maxUses: z.coerce.number().int().min(1).optional().nullable(),
  maxUsesPerEmail: z.coerce.number().int().min(1).optional().nullable(),
  expiresAt: z.string().optional(),
});

export async function createPromoCodeAction(
  eventId: string,
  organizationId: string,
  formData: FormData
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const raw = {
    code: (formData.get("code") as string)?.toUpperCase() || generateCode(),
    type: formData.get("type"),
    value: formData.get("value"),
    maxUses: formData.get("maxUses") || null,
    maxUsesPerEmail: formData.get("maxUsesPerEmail") || null,
    expiresAt: formData.get("expiresAt"),
  };

  const parsed = promoCodeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Données invalides.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Check code uniqueness on this event
  const existing = await db.promoCode.findUnique({
    where: { eventId_code: { eventId, code: parsed.data.code } },
  });
  if (existing) return { error: "Ce code existe déjà pour cet événement." };

  // Validate value range
  if (parsed.data.type === "PERCENTAGE" && (parsed.data.value < 0 || parsed.data.value > 100)) {
    return { error: "Le pourcentage doit être entre 0 et 100." };
  }

  // Get ticket type IDs filter
  const ticketTypeIds = formData.getAll("ticketTypeIds") as string[];

  await db.promoCode.create({
    data: {
      eventId,
      code: parsed.data.code,
      type: parsed.data.type,
      value: parsed.data.value,
      ticketTypeIds,
      maxUses: parsed.data.maxUses ?? null,
      maxUsesPerEmail: parsed.data.maxUsesPerEmail ?? null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    },
  });

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function togglePromoCodeAction(
  promoCodeId: string,
  organizationId: string,
  active: boolean
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  await db.promoCode.update({
    where: { id: promoCodeId },
    data: { isActive: active },
  });

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function deletePromoCodeAction(
  promoCodeId: string,
  organizationId: string
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const promo = await db.promoCode.findUnique({ where: { id: promoCodeId } });
  if (promo?.usedCount && promo.usedCount > 0) {
    return { error: "Code déjà utilisé — désactivez-le à la place." };
  }

  await db.promoCode.delete({ where: { id: promoCodeId } });
  revalidatePath(`/dashboard`);
  return { success: true };
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
