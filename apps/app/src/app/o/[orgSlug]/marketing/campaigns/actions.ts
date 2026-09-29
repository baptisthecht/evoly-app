"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { countAudience, deleteCampaign, previewCampaign, saveCampaign, saveTemplate, scheduleCampaign, sendTestCampaign, unscheduleCampaign } from "@/server/campaigns";
import { runOrgAction, type ActionState } from "@/server/guard";

const OPTS = { permission: "MARKETING_MANAGE", feature: "EMAIL_MARKETING" } as const;
const path = (orgSlug: string) => `/o/${orgSlug}/marketing`;

const campaignSchema = z.object({
  name: z.string().trim().min(2, { message: "validation.textLength" }).max(120),
  subject: z.string().trim().min(2, { message: "validation.textLength" }).max(150),
  previewText: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(200).nullable()),
  blocks: z.array(z.any()).max(40),
  segment: z.any(),
});

export async function saveCampaignAction(orgSlug: string, id: string | null, input: unknown): Promise<ActionState<{ id: string }>> {
  const r = await runOrgAction(orgSlug, input, { schema: campaignSchema, ...OPTS }, async (d, ctx) => ({ id: (await saveCampaign(ctx, { id, ...d })).id }));
  if (r?.ok) revalidatePath(path(orgSlug), "layout");
  return r;
}

export async function audienceAction(orgSlug: string, segment: unknown): Promise<number> {
  const r = await runOrgAction(orgSlug, { segment }, { schema: z.object({ segment: z.any() }), ...OPTS, write: false }, async (d, ctx) => countAudience(ctx, d.segment));
  return r?.ok ? r.data : 0;
}

export async function previewAction(orgSlug: string, id: string): Promise<ActionState<{ html: string; subject: string }>> {
  return runOrgAction(orgSlug, {}, { schema: z.object({}), ...OPTS, write: false }, async (_d, ctx) => {
    const mail = await previewCampaign(ctx, id);
    return { html: mail.html, subject: mail.subject };
  });
}

export async function testAction(orgSlug: string, id: string): Promise<ActionState<{ to: string }>> {
  return runOrgAction(orgSlug, {}, { schema: z.object({}), ...OPTS }, async (_d, ctx) => ({ to: await sendTestCampaign(ctx, id) }));
}

export async function scheduleAction(orgSlug: string, id: string, at: string | null): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, { at }, { schema: z.object({ at: z.string().datetime({ offset: true }).nullable() }), ...OPTS }, async (d, ctx) => {
    await scheduleCampaign(ctx, id, d.at ? new Date(d.at) : null);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug), "layout");
  return r;
}

export async function unscheduleAction(orgSlug: string, id: string): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), ...OPTS }, async (_d, ctx) => {
    await unscheduleCampaign(ctx, id);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug), "layout");
  return r;
}

export async function deleteCampaignAction(orgSlug: string, id: string): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), ...OPTS }, async (_d, ctx) => {
    await deleteCampaign(ctx, id);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug), "layout");
  return r;
}

/** Modèle personnel réutilisable, à partir du contenu en cours. */
export async function saveTemplateAction(orgSlug: string, input: unknown): Promise<ActionState> {
  const schema = z.object({ name: z.string().trim().min(2).max(80), subject: z.string().trim().min(2).max(150), previewText: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(200).nullable()), blocks: z.array(z.any()).max(40) });
  const r = await runOrgAction(orgSlug, input, { schema, ...OPTS }, async (d, ctx) => {
    await saveTemplate(ctx, d);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug), "layout");
  return r;
}
