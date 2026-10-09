"use server";

import type { NotificationType } from "@evoly/db";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/server/context";
import { saveNotificationPreferences } from "@/server/notifications";

/** Préférences de notification du membre connecté (P1). */
export async function savePreferencesAction(orgSlug: string, muted: string[], mutedEmails: string[]) {
  const ctx = await requireOrgContext(orgSlug);
  const clean = (l: unknown) => (Array.isArray(l) ? l.filter((x): x is string => typeof x === "string").slice(0, 50) : []) as NotificationType[];
  await saveNotificationPreferences(ctx.organization.id, ctx.user.id, clean(muted), clean(mutedEmails));
  revalidatePath(`/o/${orgSlug}/notifications/preferences`);
  return { ok: true as const };
}
