"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import { z } from "zod";

// ─────────────────────────────────────────
// AUTOMATISATIONS
// ─────────────────────────────────────────

export async function toggleAutomationAction(
  automationId: string,
  organizationId: string,
  enabled: boolean
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  await db.emailAutomation.update({
    where: { id: automationId },
    data: { enabled },
  });

  return { success: true };
}

export async function saveAutomationContentAction(
  automationId: string,
  organizationId: string,
  content: object
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  await db.emailAutomation.update({
    where: { id: automationId },
    data: { content },
  });

  return { success: true };
}

// Init automations for new events (called when publishing)
export async function initEventAutomationsAction(eventId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const existing = await db.emailAutomation.findMany({ where: { eventId } });
  const existingTypes = existing.map((a) => a.type);

  const defaultAutomations = [
    { type: "REMINDER_J7" as const, enabled: true },
    { type: "REMINDER_J1" as const, enabled: true },
    { type: "REMINDER_J0" as const, enabled: true },
    { type: "POST_EVENT" as const, enabled: false },
    { type: "LAST_TICKETS" as const, enabled: false },
  ];

  for (const auto of defaultAutomations) {
    if (!existingTypes.includes(auto.type)) {
      await db.emailAutomation.create({
        data: {
          eventId,
          type: auto.type,
          enabled: auto.enabled,
          content: { blocks: [] },
        },
      });
    }
  }

  return { success: true };
}

// ─────────────────────────────────────────
// CAMPAGNES
// ─────────────────────────────────────────

const campaignSchema = z.object({
  subject: z.string().min(1, "Objet requis").max(200),
  content: z.any(),
  segment: z.any(),
  scheduledAt: z.string().optional().nullable(),
});

export async function createCampaignAction(
  eventId: string,
  organizationId: string,
  data: unknown
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  // Check Pro plan
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { planId: true },
  });
  if (org?.planId !== "pro") return { error: "L'email marketing est réservé au plan Pro." };

  const parsed = campaignSchema.safeParse(data);
  if (!parsed.success) return { error: "Données invalides." };

  const { subject, content, segment, scheduledAt } = parsed.data;

  const campaign = await db.emailCampaign.create({
    data: {
      eventId,
      organizationId,
      subject,
      content: content ?? { blocks: [] },
      segment: segment ?? { type: "all" },
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    },
  });

  return { success: true, campaignId: campaign.id };
}

export async function updateCampaignAction(
  campaignId: string,
  organizationId: string,
  data: unknown
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { error: "Campagne introuvable." };
  if (campaign.status === "SENT") return { error: "Impossible de modifier une campagne envoyée." };

  const parsed = campaignSchema.safeParse(data);
  if (!parsed.success) return { error: "Données invalides." };

  const { subject, content, segment, scheduledAt } = parsed.data;

  await db.emailCampaign.update({
    where: { id: campaignId },
    data: {
      subject,
      content,
      segment,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
    },
  });

  return { success: true };
}

export async function cancelCampaignAction(campaignId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { error: "Campagne introuvable." };
  if (campaign.status === "SENT") return { error: "Impossible d'annuler une campagne envoyée." };

  await db.emailCampaign.update({
    where: { id: campaignId },
    data: { status: "CANCELLED" },
  });

  return { success: true };
}

export async function sendCampaignNowAction(campaignId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const campaign = await db.emailCampaign.findUnique({
    where: { id: campaignId },
    include: { event: { include: { organization: { select: { planId: true } } } } },
  });
  if (!campaign) return { error: "Campagne introuvable." };
  if (campaign.status === "SENT") return { error: "Campagne déjà envoyée." };
  if (campaign.event.organization.planId !== "pro") return { error: "Plan Pro requis." };

  // Count recipients
  const recipientCount = await countRecipients(campaign.eventId, campaign.segment as any);
  if (recipientCount === 0) return { error: "Aucun destinataire dans ce segment." };

  await db.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "SENDING",
      sentAt: new Date(),
      recipientCount,
    },
  });

  // Async send via Resend (simplified — real impl would use queue)
  sendCampaignAsync(campaign.id, campaign.eventId, campaign.subject, campaign.content as any, campaign.segment as any).catch(console.error);

  return { success: true, recipientCount };
}

async function countRecipients(eventId: string, segment: { type: string }): Promise<number> {
  const base = { eventId, status: "COMPLETED" as const };
  if (segment.type === "all") {
    return db.order.count({ where: base });
  }
  return db.order.count({ where: base });
}

async function sendCampaignAsync(
  campaignId: string,
  eventId: string,
  subject: string,
  content: any,
  segment: any
) {
  // Simplified — real impl uses Resend batch API
  try {
    const orders = await db.order.findMany({
      where: { eventId, status: "COMPLETED" },
      select: { buyerEmail: true, buyerFirstName: true, buyerLastName: true },
    });

    // Check unsubscribes
    const org = await db.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });

    for (const order of orders) {
      const unsub = await db.emailUnsubscribe.findFirst({
        where: {
          email: order.buyerEmail,
          OR: [
            { organizationId: org?.organizationId },
            { eventId },
          ],
        },
      });
      if (unsub) continue;

      // TODO: send via Resend
      // await resend.emails.send({...})
    }

    await db.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "SENT" },
    });
  } catch (err) {
    await db.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "CANCELLED" },
    });
  }
}

// ─────────────────────────────────────────
// UNSUBSCRIBE
// ─────────────────────────────────────────

export async function unsubscribeAction(
  email: string,
  organizationId?: string,
  eventId?: string
) {
  const orgId = organizationId ?? null;
  const evId = eventId ?? null;
  await db.emailUnsubscribe.upsert({
    where: { email_organizationId_eventId: { email, organizationId: orgId as string, eventId: evId as string } },
    create: { email, organizationId: orgId, eventId: evId },
    update: {},
  });
  return { success: true, error: null };
}
