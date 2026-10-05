import "server-only";
import { CoreError, emailDocIsEmpty, toEmailDoc, validateEmailDoc, type EmailDoc } from "@evoly/core";
import { Prisma } from "@evoly/db";
import { formatDateTime, toLocale } from "@evoly/i18n";
import { db } from "@/lib/db";
import type { OrgContext } from "./context";
import { emailBrandFor } from "./email/brand";
import { renderEventBlock } from "./email/eventBlock";
import { inspectEmailHtml, sanitizeEmailHtml } from "./email/sanitize";
import { orderConfirmationEmail, reminderEmail } from "./email/templates";

/** Bloc personnalisé des e-mails d'un événement : e-mail des billets ou e-mails de rappel. */
export type EventEmailKind = "ticket" | "reminder";
const FIELD = { ticket: "ticketEmailContent", reminder: "reminderEmailContent" } as const;

async function ownEvent(ctx: OrgContext, eventId: string) {
  const e = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    select: { id: true, title: true, startsAt: true, timezone: true, locationName: true, city: true, ticketTypes: { take: 1, select: { name: true } } },
  });
  if (!e) throw new CoreError("NOT_FOUND");
  return e;
}

/** Contenus enregistrés, prêts pour l'éditeur (vides si rien n'est défini). */
export async function eventEmailBlocks(eventId: string): Promise<Record<EventEmailKind, EmailDoc>> {
  const e = await db.event.findUnique({ where: { id: eventId }, select: { ticketEmailContent: true, reminderEmailContent: true } });
  const doc = (v: unknown) => toEmailDoc(v ?? {}, { sanitizeHtml: sanitizeEmailHtml });
  return { ticket: doc(e?.ticketEmailContent), reminder: doc(e?.reminderEmailContent) };
}

/** Enregistre le bloc (validé et nettoyé) ; un bloc vide est effacé. */
export async function saveEventEmailBlock(ctx: OrgContext, eventId: string, kind: EventEmailKind, content: unknown) {
  const e = await ownEvent(ctx, eventId);
  const doc = validateEmailDoc(content, { sanitizeHtml: sanitizeEmailHtml });
  await db.event.update({ where: { id: e.id }, data: { [FIELD[kind]]: emailDocIsEmpty(doc) ? Prisma.DbNull : (doc as unknown as Prisma.InputJsonValue) } });
}

/** Aperçu dans le vrai e-mail (billets ou rappel), avec les données de l'événement et un exemple de commande. */
export async function previewEventEmailBlock(ctx: OrgContext, eventId: string, kind: EventEmailKind, content: unknown) {
  const e = await ownEvent(ctx, eventId);
  const warnings = new Set<string>();
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const r = n as { type?: unknown; attrs?: { html?: unknown }; content?: unknown };
    if (r.type === "rawHtml" && typeof r.attrs?.html === "string") for (const w of inspectEmailHtml(r.attrs.html).warnings) warnings.add(w);
    if (Array.isArray(r.content)) r.content.forEach(walk);
  };
  walk(content);
  const brand = await emailBrandFor(ctx.organization.id);
  const locale = toLocale(ctx.organization.locale);
  const firstName = ctx.user.name.trim().split(/\s+/)[0] || "Léa";
  const custom = renderEventBlock(content, { firstName, brand });
  const when = formatDateTime(e.startsAt, e.timezone, locale, "long");
  const where = [e.locationName, e.city].filter(Boolean).join(", ");
  const mail =
    kind === "ticket"
      ? orderConfirmationEmail({
          brand,
          locale,
          organizationName: ctx.organization.name,
          eventTitle: e.title,
          when,
          where: where || null,
          online: null,
          lines: [{ name: e.ticketTypes[0]?.name ?? "-", quantity: 2 }],
          total: null,
          reference: "EVO-AB12-CD34",
          url: "https://evoly.me",
          firstName,
          custom,
        })
      : reminderEmail({
          brand,
          locale,
          type: "REMINDER_J1",
          organizationName: ctx.organization.name,
          organizationAddress: "",
          firstName,
          eventTitle: e.title,
          when,
          where,
          tickets: 2,
          ticketsUrl: "https://evoly.me",
          unsubscribeEventUrl: "https://evoly.me",
          custom,
        });
  return { html: mail.html, subject: mail.subject, warnings: [...warnings] };
}
