import "server-only";
import { CoreError, effectiveEnd, effectivePlan, eventCapacity, hasFeature, lastSeatsReached, postEventDue, remainingDailyQuota, reminderDue, reminderSendAt, utcToZonedLocal, zonedLocalToUtc, type CampaignBlock, type ReminderType } from "@evoly/core";
import { formatDateTime, type Locale, baseLocale, toLocale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { orderAccessToken } from "./checkout";
import type { OrgContext } from "./context";
import { emailBrandFor } from "./email/brand";
import { sendEmail } from "./email/send";
import { reminderEmail } from "./email/templates";
import { getPlans } from "./plans";
import { mayReceive, oneClickUnsubscribeUrl, unsubscribeUrl } from "./unsubscribe";
import { campaignBase, renderWithBase } from "./campaigns";
import { organizationPublicUrl } from "./urls";

export const REMINDERS: ReminderType[] = ["REMINDER_J7", "REMINDER_J1", "REMINDER_J0"];

/** Rappels d'un événement, créés à la première lecture, activés par défaut (section 9.18). */
export async function eventReminders(eventId: string) {
  const existing = await db.emailAutomation.findMany({ where: { eventId, type: { in: REMINDERS } } });
  const missing = REMINDERS.filter((t) => !existing.some((a) => a.type === t));
  if (missing.length) await db.emailAutomation.createMany({ data: missing.map((type) => ({ eventId, type, enabled: true, subject: "", content: {} })), skipDuplicates: true });
  return db.emailAutomation.findMany({ where: { eventId, type: { in: REMINDERS } }, orderBy: { type: "asc" } });
}

export async function setReminderEnabled(ctx: OrgContext, eventId: string, type: ReminderType, enabled: boolean) {
  if (!hasFeature(ctx.features, "EMAIL_MARKETING")) throw new CoreError("PRO_REQUIRED");
  const event = await db.event.findFirst({ where: { id: eventId, organizationId: ctx.organization.id }, select: { id: true } });
  if (!event) throw new CoreError("NOT_FOUND");
  await eventReminders(event.id);
  await db.emailAutomation.update({ where: { eventId_type: { eventId: event.id, type } }, data: { enabled } });
  await audit({ action: "automation.toggled", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Event", targetId: event.id, metadata: { type, enabled } });
}

/**
 * US-MKT-01 : envoi des rappels dus (tâche toutes les 15 minutes). Un e-mail par commande avec au moins un billet valide ;
 * jamais deux fois ; jamais pour un événement annulé ou commencé (RG-MKT-06) ; désinscription de l'événement respectée.
 */
export async function runDueReminders(now = new Date()): Promise<number> {
  const events = await db.event.findMany({
    where: { deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED", "ARCHIVED"] }, startsAt: { gt: now, lt: new Date(now.getTime() + 8 * 86_400_000) }, organization: { status: "ACTIVE" } },
    include: { organization: { select: { id: true, name: true, subdomain: true, slug: true, addressLine1: true, postalCode: true, city: true, subscription: { select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } } } } },
  });
  const plans = await getPlans();
  let sent = 0;
  for (const event of events) {
    if (!hasFeature(plans[effectivePlan(event.organization.subscription, now)].features, "EMAIL_MARKETING")) continue;
    for (const automation of await eventReminders(event.id)) {
      if (!automation.enabled) continue;
      const sendAt = reminderSendAt(event.startsAt, event.timezone, automation.type as ReminderType);
      if (!reminderDue(sendAt, event.startsAt, now) || (automation.lastRunAt && automation.lastRunAt >= sendAt)) continue;
      await db.emailAutomation.update({ where: { id: automation.id }, data: { lastRunAt: now } });
      const orders = await db.order.findMany({ where: { eventId: event.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, tickets: { some: { status: "VALID" } } }, select: { id: true, buyerEmail: true, buyerFirstName: true, buyerLocale: true, contactId: true, accessTokenVersion: true, _count: { select: { tickets: { where: { status: "VALID" } } } } } });
      const brand = await emailBrandFor(event.organizationId);
      const siteBase = organizationPublicUrl(event.organization.subdomain ?? event.organization.slug);
      for (const o of orders) {
        if (await db.emailMessage.findFirst({ where: { automationId: automation.id, orderId: o.id }, select: { id: true } })) continue;
        if (!(await mayReceive(o.buyerEmail, "SERVICE", event.organizationId, event.id))) continue;
        const locale = (o.buyerLocale === "en" ? "en" : "fr") as Locale;
        const mail = reminderEmail({
          brand,
          locale,
          type: automation.type as ReminderType,
          organizationName: event.organization.name,
          organizationAddress: [event.organization.addressLine1, [event.organization.postalCode, event.organization.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
          firstName: o.buyerFirstName,
          eventTitle: event.title,
          when: formatDateTime(event.startsAt, event.timezone, locale, "long"),
          where: [event.locationName, event.city].filter(Boolean).join(", "),
          tickets: o._count.tickets,
          ticketsUrl: `${siteBase}/billets/${orderAccessToken(o.id, o.accessTokenVersion)}`,
          unsubscribeEventUrl: unsubscribeUrl(o.buyerEmail, event.organizationId, event.id),
        });
        await sendEmail({ ...mail, to: o.buyerEmail, template: `automation.${automation.type.toLowerCase()}`, category: "SERVICE", organizationId: event.organizationId, orderId: o.id, automationId: automation.id, contactId: o.contactId ?? undefined, fromName: brand.fromName, replyTo: brand.replyTo, unsubscribeUrl: oneClickUnsubscribeUrl(o.buyerEmail, event.organizationId, event.id) })
          .then(() => (sent += 1))
          .catch((err) => console.error("rappel non envoyé", automation.id, o.id, err));
      }
    }
  }
  return sent;
}

export const MARKETING_AUTOMATIONS = ["POST_EVENT", "LAST_TICKETS"] as const;
export type MarketingAutomation = (typeof MARKETING_AUTOMATIONS)[number];

const DEFAULTS: Record<"fr" | "en", Record<MarketingAutomation, (title: string) => { subject: string; message: string }>> = {
  fr: {
    POST_EVENT: (t) => ({ subject: `Merci d’être venu·e à ${t}`, message: `Bonjour {{prenom}},\nMerci pour votre présence à ${t}. On espère vous revoir très vite !` }),
    LAST_TICKETS: (t) => ({ subject: `Dernières places pour ${t}`, message: `Bonjour {{prenom}},\nIl ne reste que quelques places pour ${t}. Réservez vite la vôtre.` }),
  },
  en: {
    POST_EVENT: (t) => ({ subject: `Thanks for coming to ${t}`, message: `Hi {{prenom}},\nThanks for being at ${t}. We hope to see you again soon!` }),
    LAST_TICKETS: (t) => ({ subject: `Last seats for ${t}`, message: `Hi {{prenom}},\nOnly a few seats are left for ${t}. Book yours now.` }),
  },
};

/** Remerciement et dernières places d'un événement, désactivés par défaut (section 9.18). */
export async function eventMarketingAutomations(eventId: string) {
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { title: true, organization: { select: { locale: true } } } });
  const existing = await db.emailAutomation.findMany({ where: { eventId, type: { in: [...MARKETING_AUTOMATIONS] } } });
  const locale = toLocale(event.organization.locale);
  const missing = MARKETING_AUTOMATIONS.filter((t) => !existing.some((a) => a.type === t));
  if (missing.length) await db.emailAutomation.createMany({ data: missing.map((type) => { const d = DEFAULTS[baseLocale(locale)][type](event.title); return { eventId, type, enabled: false, subject: d.subject, content: { message: d.message } }; }), skipDuplicates: true });
  // ordre de déclaration de l'énumération : remerciement, puis dernières places
  return db.emailAutomation.findMany({ where: { eventId, type: { in: [...MARKETING_AUTOMATIONS] } }, orderBy: { type: "asc" } });
}

export async function saveMarketingAutomation(ctx: OrgContext, eventId: string, type: MarketingAutomation, input: { enabled: boolean; subject: string; message: string }) {
  if (!hasFeature(ctx.features, "EMAIL_MARKETING")) throw new CoreError("PRO_REQUIRED");
  const event = await db.event.findFirst({ where: { id: eventId, organizationId: ctx.organization.id }, select: { id: true } });
  if (!event) throw new CoreError("NOT_FOUND");
  await eventMarketingAutomations(event.id);
  await db.emailAutomation.update({ where: { eventId_type: { eventId: event.id, type } }, data: { enabled: input.enabled, subject: input.subject.trim(), content: { message: input.message.trim() } } });
  await audit({ action: "automation.saved", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Event", targetId: event.id, metadata: { type, enabled: input.enabled } });
}

async function marketingQuota(organizationId: string, timezone: string, cap: number, now: Date) {
  const start = zonedLocalToUtc(`${utcToZonedLocal(now, timezone).slice(0, 10)}T00:00`, timezone);
  return remainingDailyQuota(cap, await db.emailMessage.count({ where: { organizationId, category: "MARKETING", queuedAt: { gte: start } } }));
}

async function sendAutomation(a: { id: string; subject: string; content: unknown }, organizationId: string, blocks: CampaignBlock[], recipients: Array<{ id: string; email: string; firstName: string | null; locale: string | null }>, quota: number, eventId: string) {
  const done = new Set((await db.emailMessage.findMany({ where: { automationId: a.id }, select: { contactId: true } })).map((m) => m.contactId));
  const pending: typeof recipients = [];
  for (const r of recipients) if (!done.has(r.id) && (await mayReceive(r.email, "MARKETING", organizationId, eventId))) pending.push(r);
  let sent = 0;
  const campaignLike = { organizationId, subject: a.subject, previewText: null, content: blocks };
  const base = pending.length ? await campaignBase(campaignLike) : null; // une fois par automatisation
  for (const r of pending.slice(0, quota)) {
    const { mail, brand } = renderWithBase(base!, campaignLike, r);
    await sendEmail({ ...mail, to: r.email, template: "automation.marketing", category: "MARKETING", organizationId, automationId: a.id, contactId: r.id, fromName: brand.fromName, replyTo: brand.replyTo, unsubscribeUrl: oneClickUnsubscribeUrl(r.email, organizationId, eventId) })
      .then(() => (sent += 1))
      .catch((err) => console.error("automatisation marketing", a.id, r.id, err));
  }
  return { sent, complete: pending.length <= quota };
}

/**
 * US-MKT-02 et dernières places : e-mails marketing automatiques (consentement exigé, RG-MKT-01), une fois par contact,
 * dans la limite du plafond quotidien (RG-MKT-07), jamais pour un événement annulé (RG-MKT-06).
 */
export async function runDueMarketingAutomations(now = new Date()): Promise<number> {
  const plans = await getPlans();
  let total = 0;
  const automations = await db.emailAutomation.findMany({
    where: { type: { in: [...MARKETING_AUTOMATIONS] }, enabled: true, lastRunAt: null, event: { deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED", "ARCHIVED"] }, organization: { status: "ACTIVE" } } },
    include: { event: { include: { ticketTypes: { where: { status: { not: "ARCHIVED" } }, select: { quantity: true, quantitySold: true } }, organization: { select: { id: true, timezone: true, marketingDailyCap: true, subscription: { select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } } } } } } },
  });
  for (const a of automations) {
    const e = a.event;
    if (!hasFeature(plans[effectivePlan(e.organization.subscription, now)].features, "EMAIL_MARKETING")) continue;
    let recipients: Array<{ id: string; email: string; firstName: string | null; locale: string | null }> = [];
    let blocks: CampaignBlock[] = [];
    const message = String((a.content as { message?: string })?.message ?? "").trim() || a.subject;
    if (a.type === "POST_EVENT") {
      if (!postEventDue(effectiveEnd(e.startsAt, e.endsAt), now)) continue;
      recipients = await db.contact.findMany({ where: { organizationId: e.organizationId, marketingConsent: true, unsubscribedAt: null, orders: { some: { eventId: e.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } } }, select: { id: true, email: true, firstName: true, locale: true } });
      const next = await db.event.findFirst({ where: { organizationId: e.organizationId, id: { not: e.id }, deletedAt: null, status: { in: ["PUBLISHED", "SALES_PAUSED"] }, visibility: "PUBLIC", startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, select: { id: true } });
      blocks = [{ type: "text", text: message }, ...(next ? [{ type: "event" as const, eventId: next.id }] : [])];
    } else {
      const capacity = eventCapacity(e.capacity, e.ticketTypes.map((t) => t.quantity));
      const sold = e.ticketTypes.reduce((n, t) => n + t.quantitySold, 0);
      if (e.startsAt <= now || !lastSeatsReached({ capacity, sold })) continue;
      recipients = await db.contact.findMany({ where: { organizationId: e.organizationId, marketingConsent: true, unsubscribedAt: null, orders: { none: { eventId: e.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } } }, select: { id: true, email: true, firstName: true, locale: true } });
      blocks = [{ type: "text", text: message }, { type: "event", eventId: e.id }];
    }
    const quota = await marketingQuota(e.organizationId, e.organization.timezone, e.organization.marketingDailyCap, now);
    const { sent, complete } = await sendAutomation(a, e.organizationId, blocks, recipients, quota, e.id);
    total += sent;
    if (complete) await db.emailAutomation.update({ where: { id: a.id }, data: { lastRunAt: now } });
  }
  return total;
}
