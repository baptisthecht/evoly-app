"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveEventTheme } from "@/server/brand";
import { formToObject, runOrgAction, type ActionState } from "@/server/guard";

const optional = (max: number) => z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(max).nullable());
const schema = z.object({
  mode: z.enum(["organization", "custom"]),
  primaryColor: optional(9),
  accentColor: optional(9),
  backgroundColor: optional(9),
  radius: optional(10),
  headingFont: optional(30),
  bodyFont: optional(30),
  buttonLabel: optional(40),
});

/** Style propre à l'événement, ou celui de l'organisation (offre Pro). */
export async function saveEventThemeAction(orgSlug: string, eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, formToObject(form), { schema, permission: "EVENTS_EDIT", feature: "BRANDING" }, async (d, ctx) => {
    await saveEventTheme(ctx, eventId, { ...d, useOrganization: d.mode === "organization" });
    return null;
  });
  if (r?.ok) revalidatePath(`/o/${orgSlug}/events/${eventId}/appearance`);
  return r;
}
