"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function updateOrgSettingsAction(organizationId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };
  await requirePermission(session.user.id, organizationId, "SETTINGS_EDIT");

  const schema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal("")),
    timezone: z.string().min(1),
    type: z.enum(["INDIVIDUAL", "ASSOCIATION", "COMPANY"]),
    logoUrl: z.string().url().optional().nullable().or(z.literal("")),
  });

  const parsed = schema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    email: formData.get("email") || null,
    timezone: formData.get("timezone"),
    type: formData.get("type"),
    logoUrl: formData.get("logoUrl") || null,
  });
  if (!parsed.success) return { error: "Données invalides.", fieldErrors: parsed.error.flatten().fieldErrors };

  await db.organization.update({
    where: { id: organizationId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      email: parsed.data.email || null,
      timezone: parsed.data.timezone,
      type: parsed.data.type,
      logoUrl: parsed.data.logoUrl || null,
    },
  });

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function deleteOrganizationAction(organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };
  await requirePermission(session.user.id, organizationId, "SETTINGS_EDIT");

  // Safety checks
  const activeEvents = await db.event.count({
    where: { organizationId, status: "PUBLISHED" },
  });
  if (activeEvents > 0) return { error: "Dépubliez vos événements actifs d'abord." };

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionStatus: true },
  });
  if (org?.subscriptionStatus === "ACTIVE" || org?.subscriptionStatus === "TRIALING") {
    return { error: "Annulez votre abonnement Pro d'abord." };
  }

  await db.organization.delete({ where: { id: organizationId } });

  return { success: true };
}
