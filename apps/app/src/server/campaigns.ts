import "server-only";
import { notify } from "./notifications";
import { CoreError, hasFeature, remainingDailyQuota, scheduledCancellable, scheduledEditable, utcToZonedLocal, validateBlocks, validateSegment, zonedLocalToUtc, type CampaignBlock, type CampaignSegment } from "@evoly/core";
import type { Locale } from "@evoly/i18n";
import { toLocale } from "@evoly/i18n";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { canonicalEventUrl } from "./canonical";
import type { OrgContext } from "./context";
import { emailBrandFor } from "./email/brand";
import { renderCampaign, type CampaignEventCard } from "./email/campaignRender";
import { sendEmail } from "./email/send";
import { getPublicOrganization } from "./publicEvents";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "./unsubscribe";

const LOCKED = ["SENDING", "SENT", "CANCELLED", "FAILED"];

/** Destinataires d'une campagne : consentants, sans désinscription ni blocage (RG-MKT-01, RG-MKT-03), selon le segment. */
export async function campaignAudience(organizationId: string, segment: CampaignSegment) {
  const where: Prisma.ContactWhereInput = { organizationId, marketingConsent: true, unsubscribedAt: null, ...(segment.locale ? { locale: segment.locale } : {}) };
  if (segment.kind === "EVENTS") {
    const tickets = segment.attendance === "PRESENT" ? { tickets: { some: { status: "CHECKED_IN" as const } } } : segment.attendance === "ABSENT" ? { tickets: { none: { status: "CHECKED_IN" as const } } } : {};
    where.orders = { some: { eventId: { in: segment.eventIds }, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, ...tickets, ...(segment.ticketTypeIds?.length ? { items: { some: { ticketTypeId: { in: segment.ticketTypeIds } } } } : {}) } };
  }
  const contacts = await db.contact.findMany({ where, select: { id: true, email: true, firstName: true, locale: true } });
  if (contacts.length === 0) return [];
  const blocked = await db.emailSuppression.findMany({
    where: { email: { in: contacts.map((c) => c.email) }, OR: [{ scope: "GLOBAL" }, { scope: "ORGANIZATION", organizationId }, ...(segment.kind === "EVENTS" ? [{ scope: "EVENT" as const, organizationId, eventId: { in: segment.eventIds } }] : [])] },
    select: { email: true },
  });
  const out = new Set(blocked.map((b) => b.email));
  return contacts.filter((c) => !out.has(c.email));
}

async function ownCampaign(ctx: OrgContext, id: string) {
  const c = await db.emailCampaign.findFirst({ where: { id, organizationId: ctx.organization.id } });
  if (!c) throw new CoreError("NOT_FOUND");
  return c;
}

/** Brouillon ou campagne programmée modifiable (RG-MKT-04, RG-MKT-05). */
export async function saveCampaign(ctx: OrgContext, input: { id?: string | null; name: string; subject: string; previewText?: string | null; blocks: unknown; segment: unknown }, now = new Date()) {
  if (!hasFeature(ctx.features, "EMAIL_MARKETING")) throw new CoreError("PRO_REQUIRED");
  const blocks = validateBlocks(input.blocks);
  const segment = validateSegment(input.segment);
  if (!blocks) throw new CoreError("CAMPAIGN_CONTENT_INVALID");
  if (!segment) throw new CoreError("CAMPAIGN_SEGMENT_INVALID");
  const data = { name: input.name.trim(), subject: input.subject.trim(), previewText: input.previewText?.trim() || null, content: blocks as unknown as Prisma.InputJsonValue, segment: segment as unknown as Prisma.InputJsonValue, eventId: segment.kind === "EVENTS" && segment.eventIds.length === 1 ? segment.eventIds[0] : null };
  if (input.id) {
    const c = await ownCampaign(ctx, input.id);
    if (LOCKED.includes(c.status)) throw new CoreError("CAMPAIGN_LOCKED");
    if (c.status === "SCHEDULED" && c.scheduledAt && !scheduledEditable(c.scheduledAt, now)) throw new CoreError("CAMPAIGN_TOO_LATE");
    return db.emailCampaign.update({ where: { id: c.id }, data });
  }
  return db.emailCampaign.create({ data: { ...data, organizationId: ctx.organization.id, createdById: ctx.user.id } });
}

export async function eventCards(organizationId: string, blocks: CampaignBlock[]): Promise<Map<string, CampaignEventCard>> {
  const ids = blocks.filter((b): b is Extract<CampaignBlock, { type: "event" }> => b.type === "event").map((b) => b.eventId);
  if (ids.length === 0) return new Map();
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { subdomain: true } });
  const pub = org.subdomain ? await getPublicOrganization(org.subdomain) : null;
  const events = await db.event.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true, slug: true, subdomain: true, title: true, startsAt: true, timezone: true, locationName: true, city: true, coverImageUrl: true } });
  const cards = new Map<string, CampaignEventCard>();
  for (const e of events) cards.set(e.id, { title: e.title, startsAt: e.startsAt, timezone: e.timezone, place: [e.locationName, e.city].filter(Boolean).join(", "), coverImageUrl: e.coverImageUrl, url: pub ? await canonicalEventUrl(pub, e) : "" });
  return cards;
}

type CampaignLike = { organizationId: string; subject: string; previewText: string | null; content: unknown; id?: string | null };

/** Ce qui ne dépend pas du destinataire (organisation, marque, blocs, cartes d'événement) : chargé une fois par campagne. */
export async function campaignBase(campaign: CampaignLike) {
  const [org, brand] = await Promise.all([db.organization.findUniqueOrThrow({ where: { id: campaign.organizationId }, select: { name: true, addressLine1: true, postalCode: true, city: true } }), emailBrandFor(campaign.organizationId)]);
  const blocks = (campaign.content as CampaignBlock[]) ?? [];
  return { org, brand, blocks, events: await eventCards(campaign.organizationId, blocks) };
}

export function renderWithBase(base: Awaited<ReturnType<typeof campaignBase>>, campaign: CampaignLike, recipient: { email: string; firstName?: string | null; locale?: string | null }) {
  const { org, brand, blocks, events } = base;
  const mail = renderCampaign({
    subject: campaign.subject,
    previewText: campaign.previewText,
    blocks,
    brand,
    organizationName: brand.fromName || org.name,
    organizationAddress: [org.addressLine1, [org.postalCode, org.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    firstName: recipient.firstName,
    locale: toLocale(recipient.locale),
    unsubscribeUrl: unsubscribeUrl(recipient.email, campaign.organizationId, null, campaign.id ?? null),
    events,
  });
  return { mail, brand };
}

export async function renderFor(campaign: CampaignLike, recipient: { email: string; firstName?: string | null; locale?: string | null }) {
  return renderWithBase(await campaignBase(campaign), campaign, recipient);
}

/** Section 9.18, étape 3 : aperçu (HTML) et envoi de test à la personne connectée. */
export async function previewCampaign(ctx: OrgContext, id: string) {
  const c = await ownCampaign(ctx, id);
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { email: true, name: true } });
  return (await renderFor(c, { email: user.email, firstName: user.name.split(" ")[0], locale: ctx.organization.locale })).mail;
}

export async function sendTestCampaign(ctx: OrgContext, id: string) {
  const c = await ownCampaign(ctx, id);
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { email: true, name: true } });
  const { mail, brand } = await renderFor(c, { email: user.email, firstName: user.name.split(" ")[0], locale: ctx.organization.locale });
  await sendEmail({ ...mail, subject: `[Test] ${mail.subject}`, to: user.email, template: "campaign.test", category: "SERVICE", organizationId: c.organizationId, fromName: brand.fromName, replyTo: brand.replyTo });
  return user.email;
}

export async function countAudience(ctx: OrgContext, segment: unknown) {
  const s = validateSegment(segment);
  return s ? (await campaignAudience(ctx.organization.id, s)).length : 0;
}

/** Section 9.18, étape 4 : envoi immédiat ou programmé ; jamais sans destinataire (RG-MKT-04). */
export async function scheduleCampaign(ctx: OrgContext, id: string, at: Date | null, now = new Date()) {
  const c = await ownCampaign(ctx, id);
  if (LOCKED.includes(c.status)) throw new CoreError("CAMPAIGN_LOCKED");
  const segment = validateSegment(c.segment);
  if (!segment || (await campaignAudience(c.organizationId, segment)).length === 0) throw new CoreError("CAMPAIGN_NO_RECIPIENTS");
  const when = at ?? now;
  if (at && at.getTime() < now.getTime() + 5 * 60_000) throw new CoreError("CAMPAIGN_SCHEDULE_TOO_SOON");
  await db.emailCampaign.update({ where: { id: c.id }, data: { status: "SCHEDULED", scheduledAt: when } });
  await audit({ action: at ? "campaign.scheduled" : "campaign.send_now", organizationId: c.organizationId, actorUserId: ctx.user.id, targetType: "EmailCampaign", targetId: c.id, metadata: { at: when.toISOString() } });
}

/** RG-MKT-05 : annulable jusqu'à 5 minutes avant l'envoi ; elle redevient un brouillon. */
export async function unscheduleCampaign(ctx: OrgContext, id: string, now = new Date()) {
  const c = await ownCampaign(ctx, id);
  if (c.status !== "SCHEDULED" || !c.scheduledAt) throw new CoreError("CAMPAIGN_NOT_SCHEDULED");
  if (!scheduledCancellable(c.scheduledAt, now)) throw new CoreError("CAMPAIGN_TOO_LATE");
  await db.emailCampaign.update({ where: { id: c.id }, data: { status: "DRAFT", scheduledAt: null } });
}

export async function deleteCampaign(ctx: OrgContext, id: string) {
  const c = await ownCampaign(ctx, id);
  if (c.status !== "DRAFT") throw new CoreError("CAMPAIGN_LOCKED");
  await db.emailCampaign.delete({ where: { id: c.id } });
}

async function sentToday(organizationId: string, timezone: string, now: Date) {
  const start = zonedLocalToUtc(`${utcToZonedLocal(now, timezone).slice(0, 10)}T00:00`, timezone);
  return db.emailMessage.count({ where: { organizationId, category: "MARKETING", queuedAt: { gte: start } } });
}

/**
 * Tâche planifiée (toutes les 5 minutes) : campagnes dues, envoyées par lots dans la limite du plafond quotidien
 * (RG-MKT-07). Destinataires recalculés à chaque lot : une désinscription en cours d'envoi est respectée.
 */
export async function processCampaigns(now = new Date(), batchSize = 200): Promise<number> {
  await db.emailCampaign.updateMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, data: { status: "SENDING", sendingStartedAt: now } });
  const sending = await db.emailCampaign.findMany({ where: { status: "SENDING" }, include: { organization: { select: { timezone: true, marketingDailyCap: true, status: true } } } });
  let sent = 0;
  for (const c of sending) {
    if (c.organization.status !== "ACTIVE") continue;
    const segment = validateSegment(c.segment);
    if (!segment) {
      await db.emailCampaign.update({ where: { id: c.id }, data: { status: "FAILED" } });
      continue;
    }
    const audience = await campaignAudience(c.organizationId, segment);
    const done = new Set((await db.emailMessage.findMany({ where: { campaignId: c.id }, select: { contactId: true } })).map((m) => m.contactId));
    const pending = audience.filter((r) => !done.has(r.id));
    if (c.recipientCount == null) await db.emailCampaign.update({ where: { id: c.id }, data: { recipientCount: pending.length + done.size } });
    const quota = remainingDailyQuota(c.organization.marketingDailyCap, await sentToday(c.organizationId, c.organization.timezone, now));
    const base = pending.length ? await campaignBase(c) : null; // une fois par campagne, pas par destinataire
    for (const r of pending.slice(0, Math.min(batchSize, quota))) {
      const { mail, brand } = renderWithBase(base!, c, r);
      await sendEmail({ ...mail, to: r.email, template: "campaign", category: "MARKETING", organizationId: c.organizationId, campaignId: c.id, contactId: r.id, fromName: brand.fromName, replyTo: brand.replyTo, unsubscribeUrl: oneClickUnsubscribeUrl(r.email, c.organizationId, null, c.id) })
        .then(() => (sent += 1))
        .catch((err) => console.error("campagne : envoi échoué", c.id, r.id, err));
    }
    const remaining = pending.length - Math.min(batchSize, quota);
    if (remaining <= 0) {
      await db.emailCampaign.update({ where: { id: c.id }, data: { status: "SENT", sentAt: now } });
      await notify(c.organizationId, "CAMPAIGN_SENT", { title: c.name, body: `Campagne envoyée à ${pending.length + done.size} destinataires.`, link: `/marketing/campaigns/${c.id}` });
    }
  }
  return sent;
}

/** RG-MKT-06 : campagnes programmées d'un événement annulé, annulées avec notification. */
export async function cancelCampaignsForEvent(eventId: string) {
  const scheduled = await db.emailCampaign.findMany({ where: { eventId, status: "SCHEDULED" }, include: { createdBy: { select: { email: true } }, organization: { select: { name: true } } } });
  for (const c of scheduled) {
    await db.emailCampaign.update({ where: { id: c.id }, data: { status: "CANCELLED" } });
    if (c.createdBy?.email) await sendEmail({ to: c.createdBy.email, template: "campaign.cancelled", category: "SERVICE", organizationId: c.organizationId, subject: `Campagne annulée : ${c.name}`, text: `La campagne « ${c.name} » était programmée pour un événement annulé : elle ne sera pas envoyée.\n\nEvoly`, html: `<p>La campagne « ${c.name.replace(/</g, "&lt;")} » était programmée pour un événement annulé : elle ne sera pas envoyée.</p><p>Evoly</p>` }).catch(() => undefined);
  }
  return scheduled.length;
}

/** Modèles personnels réutilisables (section 9.18, étape 2). */
export async function saveTemplate(ctx: OrgContext, input: { name: string; subject: string; previewText?: string | null; blocks: unknown }) {
  if (!hasFeature(ctx.features, "EMAIL_MARKETING")) throw new CoreError("PRO_REQUIRED");
  const blocks = validateBlocks(input.blocks);
  if (!blocks) throw new CoreError("CAMPAIGN_CONTENT_INVALID");
  return db.emailTemplate.create({ data: { organizationId: ctx.organization.id, name: input.name.trim().slice(0, 80), subject: input.subject.trim().slice(0, 150), previewText: input.previewText?.trim() || null, content: blocks as unknown as Prisma.InputJsonValue, locale: ctx.organization.locale ?? "fr" } });
}

export async function listTemplates(ctx: OrgContext) {
  return db.emailTemplate.findMany({ where: { organizationId: ctx.organization.id, isArchived: false }, orderBy: { createdAt: "desc" }, take: 30 });
}

export async function archiveTemplate(ctx: OrgContext, id: string) {
  const done = await db.emailTemplate.updateMany({ where: { id, organizationId: ctx.organization.id }, data: { isArchived: true } });
  if (done.count === 0) throw new CoreError("NOT_FOUND");
}
