"use server";

import { auth } from "@/lib/auth";
import { db } from "@evoly/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const brandSchema = z.object({
  organizationId: z.string(),
  brandName: z.string().max(80).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  faviconUrl: z.string().url().optional().nullable(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable(),
  fromName: z.string().max(80).optional().nullable(),
});

export async function saveBrandAction(input: z.infer<typeof brandSchema>) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié" };

  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { error: "Données invalides" };

  const { organizationId, ...data } = parsed.data;

  // Check membership + SETTINGS_EDIT permission
  const membership = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: { role: true },
  });

  if (!membership?.role.permissions.includes("SETTINGS_EDIT")) {
    return { error: "Permission refusée" };
  }

  // Check Pro plan
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { planId: true, slug: true },
  });
  if (!org) return { error: "Organisation introuvable" };
  if (org.planId !== "pro") return { error: "Fonctionnalité réservée au plan Pro" };

  await db.organizationBrand.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });

  revalidatePath(`/dashboard/${org.slug}/settings`);
  revalidatePath(`/dashboard/${org.slug}/settings/brand`);

  return { success: true };
}

export async function deleteBrandLogoAction(organizationId: string, field: "logoUrl" | "faviconUrl") {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié" };

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership?.role.permissions.includes("SETTINGS_EDIT")) {
    return { error: "Permission refusée" };
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });

  await db.organizationBrand.update({
    where: { organizationId },
    data: { [field]: null },
  });

  revalidatePath(`/dashboard/${org?.slug}/settings/brand`);
  return { success: true };
}
