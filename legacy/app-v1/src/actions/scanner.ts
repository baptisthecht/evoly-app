"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import type { ScannerLink } from "@evoly/db";

export async function createScannerLinkAction(
  eventId: string,
  organizationId: string,
  label: string,
  hours: number
): Promise<{ success: boolean; link?: ScannerLink; error?: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  const link = await db.scannerLink.create({
    data: {
      eventId,
      label: label.trim(),
      expiresAt,
      createdBy: session.user.id,
    },
  });

  return { success: true, link };
}

export async function revokeScannerLinkAction(
  linkId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  await db.scannerLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  });

  return { success: true };
}
