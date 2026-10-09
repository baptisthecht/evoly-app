import "server-only";
import { randomBytes } from "node:crypto";
import { CoreError, salesOpeningAt } from "@evoly/core";
import { formatDateTime, toLocale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { emailBrandFor } from "./email/brand";
import { sendEmail } from "./email/send";
import { salesOpenEmail } from "./email/templates";
import { eventPublicUrl } from "./urls";

const KEEP_MS = 30 * 86_400_000;

/**
 * « Prévenez-moi » (RG-PRG-04) : une inscription par adresse et par événement, tant que les ventes ne sont pas ouvertes.
 * Jamais pour un événement invisible avant sa publication : son existence ne doit pas se deviner.
 */
export async function subscribeAlert(eventId: string, email: string, locale: string, now = new Date()) {
  const event = await db.event.findFirst({
    where: { id: eventId, deletedAt: null, status: "PUBLISHED", visibility: { not: "PRIVATE" } },
    select: { id: true, publishAt: true, salesStartAt: true, prePublishMode: true },
  });
  if (!event || (event.publishAt && event.publishAt > now && event.prePublishMode === "HIDDEN")) throw new CoreError("NOT_FOUND");
  const opens = salesOpeningAt(event);
  if (!opens || opens <= now) throw new CoreError("SALES_ALREADY_OPEN");
  const lang = toLocale(locale);
  await db.eventAlert.upsert({
    where: { eventId_email: { eventId, email } },
    create: { eventId, email, locale: lang, token: randomBytes(18).toString("base64url") },
    update: { locale: lang, notifiedAt: null },
  });
}

export function alertByToken(token: string) {
  return db.eventAlert.findUnique({ where: { token }, select: { id: true, event: { select: { title: true } } } });
}

export async function unsubscribeAlert(token: string) {
  await db.eventAlert.deleteMany({ where: { token } });
}

export function waitingAlerts(eventId: string) {
  return db.eventAlert.count({ where: { eventId, notifiedAt: null } });
}

/** Tâche planifiée (chaque minute) : un e-mail par inscrit dès l'ouverture des ventes, une seule fois ; purge 30 jours après l'envoi. */
export async function sendSalesOpenAlerts(now = new Date(), limit = 200) {
  const due = await db.eventAlert.findMany({
    where: {
      notifiedAt: null,
      event: {
        status: "PUBLISHED",
        deletedAt: null,
        AND: [{ OR: [{ publishAt: null }, { publishAt: { lte: now } }] }, { OR: [{ salesStartAt: null }, { salesStartAt: { lte: now } }] }],
      },
    },
    include: {
      event: {
        select: {
          title: true,
          slug: true,
          subdomain: true,
          timezone: true,
          startsAt: true,
          organizationId: true,
          organization: { select: { name: true, slug: true, subdomain: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const a of due) {
    const claimed = await db.eventAlert.updateMany({ where: { id: a.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (claimed.count === 0) continue; // déjà pris par une exécution parallèle
    const e = a.event;
    const locale = toLocale(a.locale);
    const mail = salesOpenEmail({
      brand: await emailBrandFor(e.organizationId).catch(() => null),
      locale,
      organizationName: e.organization.name,
      eventTitle: e.title,
      when: formatDateTime(e.startsAt, e.timezone, locale),
      url: eventPublicUrl(e.organization, e),
      unsubscribeUrl: `${env().NEXT_PUBLIC_APP_URL}/alerte/${a.token}`,
    });
    await sendEmail({
      to: a.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      category: "SERVICE",
      template: "alert.sales_open",
      organizationId: e.organizationId,
      fromName: e.organization.name,
    }).catch((err) => console.error("alerte d'ouverture non envoyée", err instanceof Error ? err.message : "erreur"));
    sent++;
  }
  await db.eventAlert.deleteMany({ where: { notifiedAt: { lt: new Date(now.getTime() - KEEP_MS) } } });
  return sent;
}
