"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { changeOrganizationSubdomain, saveBrand, setEventSubdomain, subdomainAvailable } from "@/server/brand";
import { addCustomDomain, removeCustomDomain, verifyCustomDomain } from "@/server/domains";
import { formToObject, runOrgAction, type ActionState } from "@/server/guard";

const optional = (max: number) => z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(max).nullable());

const brandSchema = z.object({
  displayName: optional(80),
  logoUrl: optional(500),
  faviconUrl: optional(500),
  primaryColor: optional(9),
  accentColor: optional(9),
  emailFromName: optional(80),
  emailReplyTo: z.preprocess((v) => (v === "" || v == null ? null : v), z.email({ message: "validation.email" }).max(200).nullable()),
  hideEvolyBranding: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export async function saveBrandAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, formToObject(form), { schema: brandSchema, permission: "BRAND_EDIT", feature: "BRANDING" }, async (d, ctx) => {
    await saveBrand(ctx, d);
    return null;
  });
  if (r?.ok) revalidatePath(`/o/${orgSlug}/brand`);
  return r;
}

/** RG-SDM-01 : disponibilité vérifiée en direct. */
export async function checkSubdomainAction(orgSlug: string, value: string, eventId?: string): Promise<{ ok: boolean; reason?: string; value?: string }> {
  const org = await db.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } });
  const r = await subdomainAvailable(value.slice(0, 60), eventId ? { eventId } : { organizationId: org?.id });
  return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
}

export async function changeSubdomainAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState<{ slug: string }>> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: z.object({ subdomain: z.string().trim().min(1).max(60) }), permission: "ORG_SETTINGS_EDIT" },
    async (d, ctx) => {
      await changeOrganizationSubdomain(ctx, d.subdomain);
      return { slug: orgSlug };
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/brand`);
  return r;
}

export async function addDomainAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const schema = z.object({ domain: z.string().trim().min(3).max(253), target: z.string().max(40) });
  const r = await runOrgAction(orgSlug, formToObject(form), { schema, permission: "DOMAINS_MANAGE", feature: "CUSTOM_DOMAINS" }, async (d, ctx) => {
    await addCustomDomain(ctx, d.domain, d.target === "ORGANIZATION" ? "ORGANIZATION" : "EVENT", d.target === "ORGANIZATION" ? null : d.target);
    return null;
  });
  if (r?.ok) revalidatePath(`/o/${orgSlug}/brand`);
  return r;
}

export async function domainCommandAction(orgSlug: string, domainId: string, command: "verify" | "remove", _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "DOMAINS_MANAGE" }, async (_d, ctx) => {
    if (command === "remove") await removeCustomDomain(ctx, domainId);
    else {
      const d = await db.customDomain.findFirst({ where: { id: domainId, organizationId: ctx.organization.id }, select: { id: true } });
      if (d) await verifyCustomDomain(d.id);
    }
    return null;
  });
  if (r?.ok) revalidatePath(`/o/${orgSlug}/brand`);
  return r;
}

export async function eventSubdomainAction(orgSlug: string, eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema: z.object({ subdomain: optional(60) }), permission: "EVENTS_EDIT", feature: "EVENT_SUBDOMAINS" },
    async (d, ctx) => {
      await setEventSubdomain(ctx, eventId, d.subdomain);
      return null;
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/events/${eventId}/settings`);
  return r;
}

export async function eventCoverAction(orgSlug: string, eventId: string, url: string | null): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, { url }, { schema: z.object({ url: z.string().max(500).nullable() }), permission: "EVENTS_EDIT" }, async (d, ctx) => {
    const own = d.url && (d.url.includes("/files/events/") || d.url.includes("/events/")) ? d.url : null;
    await db.event.updateMany({ where: { id: eventId, organizationId: ctx.organization.id }, data: { coverImageUrl: own } });
    return null;
  });
  if (r?.ok) revalidatePath(`/o/${orgSlug}/events/${eventId}`, "layout");
  return r;
}
