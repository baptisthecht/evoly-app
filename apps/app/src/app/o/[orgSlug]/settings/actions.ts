"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formToObject, runOrgAction, type ActionState } from "@/server/guard";
import { deleteOrganization, updateOrganizationSettings } from "@/server/organization";

const optional = (max: number) => z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(max).nullable());

const settingsSchema = z.object({
  name: z.string().trim().min(2, { message: "validation.textLength" }).max(80),
  legalName: optional(160),
  type: z.enum(["INDIVIDUAL", "ASSOCIATION", "COMPANY", "PUBLIC_BODY"]),
  description: optional(500),
  contactEmail: z.preprocess((v) => (v === "" || v == null ? null : v), z.email({ message: "validation.email" }).max(200).nullable()),
  phone: optional(40),
  website: optional(300),
  country: z.string().length(2),
  currency: z.string().length(3),
  locale: z.enum(["fr", "en"]),
  timezone: z.string().min(1).max(60),
  addressLine1: optional(160),
  addressLine2: optional(160),
  postalCode: optional(16),
  city: optional(80),
  vatNumber: optional(20),
  vatRegistered: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

/** US-ORG-01 : paramètres de l'organisation. */
export async function saveSettingsAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, formToObject(form), { schema: settingsSchema, permission: "ORG_SETTINGS_EDIT" }, async (d, ctx) => {
    await updateOrganizationSettings(ctx, d);
    return null;
  });
  if (r?.ok) revalidatePath(`/o/${orgSlug}`, "layout");
  return r;
}

/** RG-ORG-06 : suppression par le propriétaire, confirmée deux fois (case cochée, nom saisi). */
export async function deleteOrganizationAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const schema = z.object({ understood: z.literal("on", { message: "validation.required" }), confirmation: z.string().trim().min(1, { message: "validation.required" }).max(120) });
  const r = await runOrgAction(orgSlug, formToObject(form), { schema, write: false }, async (d, ctx) => {
    await deleteOrganization(ctx, d.confirmation);
    return null;
  });
  if (r?.ok) redirect("/");
  return r;
}
