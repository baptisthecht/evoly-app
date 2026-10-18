import "server-only";
import { randomBytes } from "node:crypto";
import { CoreError } from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { formatDateTime, toLocale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeError } from "@/lib/redact";
import { emailBrandFor } from "./email/brand";
import { sendEmail } from "./email/send";
import { waitlistJoinedEmail, waitlistOfferEmail, waitlistResaleEmail } from "./email/templates";
import { resaleShortUrl } from "./resale";
import { eventPublicUrl } from "./urls";
import type { OrgContext } from "./context";
import { findEvent } from "./events";
import { csvSafe } from "@/lib/csv";

/**
 * Liste d'attente (section 9.30). Une place libérée revient d'abord aux inscrits, dans l'ordre d'inscription : tant que des
 * inscrits attendent, le tarif reste complet pour le public, et chacun reçoit à son tour un lien personnel qui lui garde ses places.
 */
export const WAITLIST_OFFER_MINUTES = 30; // RG-ATT-03
type Tx = Prisma.TransactionClient;
const activeOffer = (now: Date): Prisma.WaitlistEntryWhereInput => ({ status: "OFFERED", offerExpiresAt: { gt: now } });
const unsubscribeUrl = (token: string) => `${env().NEXT_PUBLIC_APP_URL}/attente/${token}`;

/** Places encore libres sur un tarif, dans la limite de la jauge de l'événement. */
async function freePlaces(tx: Tx | typeof db, ticketTypeId: string) {
  const tt = await tx.ticketType.findUniqueOrThrow({
    where: { id: ticketTypeId },
    select: {
      quantity: true,
      quantitySold: true,
      quantityHeld: true,
      event: { select: { capacity: true, ticketTypes: { select: { quantitySold: true, quantityHeld: true } } } },
    },
  });
  const typeFree = tt.quantity == null ? Infinity : tt.quantity - tt.quantitySold - tt.quantityHeld;
  const used = tt.event.ticketTypes.reduce((n, t) => n + t.quantitySold + t.quantityHeld, 0);
  const eventFree = tt.event.capacity == null ? Infinity : tt.event.capacity - used;
  return Math.max(0, Math.min(typeFree, eventFree));
}

/** Places déjà promises à des inscrits qui n'ont pas encore réservé (les réservations en cours sont déjà retenues dans le stock). */
async function promisedPlaces(tx: Tx, ticketTypeId: string, now: Date) {
  const offers = await tx.waitlistEntry.findMany({
    where: { ticketTypeId, ...activeOffer(now) },
    select: { quantity: true, offeredQuantity: true, orderId: true },
  });
  let n = 0;
  for (const o of offers) {
    if (o.orderId) {
      const order = await tx.order.findUnique({ where: { id: o.orderId }, select: { status: true, holdExpiresAt: true } });
      if (
        order &&
        (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED" || (order.status === "PENDING" && order.holdExpiresAt && order.holdExpiresAt > now))
      )
        continue;
    }
    n += o.offeredQuantity ?? o.quantity;
  }
  return n;
}

/** RG-ATT-01 : inscription sur un tarif complet ; une par adresse et par tarif ; e-mail de confirmation avec la désinscription. */
export async function joinWaitlist(eventId: string, ticketTypeId: string, email: string, quantity: number, locale: string, now = new Date()) {
  const tt = await db.ticketType.findFirst({
    where: { id: ticketTypeId, eventId, event: { deletedAt: null, status: "PUBLISHED", visibility: { not: "PRIVATE" } } },
    select: {
      id: true,
      name: true,
      maxPerOrder: true,
      event: { select: { title: true, organizationId: true, maxTicketsPerOrder: true, organization: { select: { name: true } } } },
    },
  });
  if (!tt) throw new CoreError("NOT_FOUND");
  const max = Math.min(4, tt.maxPerOrder, tt.event.maxTicketsPerOrder);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) throw new CoreError("WAITLIST_QUANTITY_INVALID");
  const queued = await db.waitlistEntry.count({ where: { ticketTypeId, OR: [{ status: "WAITING" }, activeOffer(now)] } });
  if (queued === 0 && (await freePlaces(db, ticketTypeId)) > 0) throw new CoreError("WAITLIST_NOT_SOLD_OUT");
  const lang = toLocale(locale);
  const existing = await db.waitlistEntry.findUnique({ where: { ticketTypeId_email: { ticketTypeId, email } } });
  if (existing && (existing.status === "WAITING" || existing.status === "OFFERED")) return existing; // déjà dans la file : sa place est gardée
  const entry = existing
    ? await db.waitlistEntry.update({
        where: { id: existing.id },
        data: {
          status: "WAITING",
          quantity,
          offeredQuantity: null,
          locale: lang,
          createdAt: now,
          consentAt: now,
          offeredAt: null,
          offerExpiresAt: null,
          orderId: null,
        },
      })
    : await db.waitlistEntry.create({
        data: { eventId, ticketTypeId, email, quantity, locale: lang, token: randomBytes(18).toString("base64url"), createdAt: now, consentAt: now },
      });
  const mail = waitlistJoinedEmail({
    brand: await emailBrandFor(tt.event.organizationId).catch(() => null),
    locale: lang,
    organizationName: tt.event.organization.name,
    eventTitle: tt.event.title,
    ticketTypeName: tt.name,
    unsubscribeUrl: unsubscribeUrl(entry.token),
  });
  await sendEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    category: "SERVICE",
    template: "waitlist.joined",
    organizationId: tt.event.organizationId,
    fromName: tt.event.organization.name,
  }).catch((err) => console.error("inscription à la liste d'attente : e-mail non envoyé", safeError(err)));
  return entry;
}

/** RG-ATT-05 : désinscription en un clic. */
export async function leaveWaitlist(token: string) {
  await db.waitlistEntry.updateMany({ where: { token, status: { in: ["WAITING", "OFFERED"] } }, data: { status: "CANCELLED" } });
}

export function waitlistByToken(token: string) {
  return db.waitlistEntry.findUnique({ where: { token }, include: { event: { select: { title: true } }, ticketType: { select: { name: true } } } });
}

/** Tarifs que le public ne peut pas acheter : des inscrits attendent, ou une place leur est proposée. */
export async function blockedForPublic(tx: Tx | typeof db, ticketTypeIds: string[], now: Date) {
  const rows = await tx.waitlistEntry.groupBy({
    by: ["ticketTypeId"],
    where: { ticketTypeId: { in: ticketTypeIds }, OR: [{ status: "WAITING" }, activeOffer(now)] },
  });
  return new Set(rows.map((r) => r.ticketTypeId));
}

/** L'offre en cours d'un inscrit, d'après son lien personnel. */
export function validOffer(tx: Tx | typeof db, token: string, eventId: string, now: Date) {
  return tx.waitlistEntry.findFirst({ where: { token, eventId, ...activeOffer(now) } });
}

/** Après paiement d'une commande passée avec une offre. */
export async function markWaitlistPurchased(orderId: string) {
  await db.waitlistEntry.updateMany({ where: { orderId, status: "OFFERED" }, data: { status: "PURCHASED" } });
}

async function sendOffer(entryId: string) {
  const e = await db.waitlistEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: {
      ticketType: { select: { name: true } },
      event: {
        select: {
          title: true,
          slug: true,
          subdomain: true,
          timezone: true,
          organizationId: true,
          organization: { select: { name: true, slug: true, subdomain: true } },
        },
      },
    },
  });
  const locale = toLocale(e.locale);
  const mail = waitlistOfferEmail({
    brand: await emailBrandFor(e.event.organizationId).catch(() => null),
    locale,
    organizationName: e.event.organization.name,
    eventTitle: e.event.title,
    ticketTypeName: e.ticketType.name,
    quantity: e.offeredQuantity ?? e.quantity,
    until: formatDateTime(e.offerExpiresAt!, e.event.timezone, locale),
    url: `${eventPublicUrl(e.event.organization, e.event)}?attente=${e.token}`,
    unsubscribeUrl: unsubscribeUrl(e.token),
  });
  await sendEmail({
    to: e.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    category: "TRANSACTIONAL",
    template: "waitlist.offer",
    organizationId: e.event.organizationId,
    fromName: e.event.organization.name,
  });
}

/**
 * Tâche planifiée, chaque minute (RG-ATT-02 et RG-ATT-03) : achats confirmés, offres expirées closes, puis places libres proposées
 * dans l'ordre d'inscription, sous le même verrou d'événement que les réservations.
 */
export async function dispatchWaitlist(now = new Date()) {
  const linked = await db.waitlistEntry.findMany({ where: { status: "OFFERED", orderId: { not: null } }, select: { orderId: true } });
  for (const l of linked) {
    const order = await db.order.findUnique({ where: { id: l.orderId! }, select: { status: true } });
    if (order && (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED")) await markWaitlistPurchased(l.orderId!);
  }
  const expired = (await db.waitlistEntry.updateMany({ where: { status: "OFFERED", offerExpiresAt: { lte: now } }, data: { status: "EXPIRED" } })).count;
  const types = await db.waitlistEntry.groupBy({ by: ["ticketTypeId"], where: { status: "WAITING" } });
  const offered: string[] = [];
  for (const { ticketTypeId } of types) {
    const made = await db.$transaction(async (tx) => {
      const tt = await tx.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId }, select: { eventId: true } });
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Event" WHERE id = ${tt.eventId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (locked.length !== 1) return [];
      let free = (await freePlaces(tx, ticketTypeId)) - (await promisedPlaces(tx, ticketTypeId, now));
      const queue = await tx.waitlistEntry.findMany({ where: { ticketTypeId, status: "WAITING" }, orderBy: { createdAt: "asc" }, take: 20 });
      const ids: string[] = [];
      for (const e of queue) {
        if (free <= 0) break;
        const q = Math.min(e.quantity, free);
        await tx.waitlistEntry.update({
          where: { id: e.id },
          data: { status: "OFFERED", offeredQuantity: q, offeredAt: now, offerExpiresAt: new Date(now.getTime() + WAITLIST_OFFER_MINUTES * 60_000) },
        });
        free -= q;
        ids.push(e.id);
      }
      return ids;
    });
    offered.push(...made);
  }
  for (const id of offered) await sendOffer(id).catch((err) => console.error("offre de la liste d'attente non envoyée", safeError(err)));
  return { expired, offered: offered.length };
}

/** Offre en cours, pour la page de vente ouverte avec le lien personnel. */
export async function waitlistOfferView(token: string, eventId: string, now = new Date()) {
  const e = await validOffer(db, token.slice(0, 60), eventId, now);
  return e ? { token: e.token, ticketTypeId: e.ticketTypeId, quantity: e.offeredQuantity ?? e.quantity, expiresAt: e.offerExpiresAt!.toISOString() } : null;
}

/** Nombre d'inscrits et de places demandées par tarif, pour l'organisateur (RG-ATT-06). */
export async function waitlistCounts(eventId: string) {
  return db.waitlistEntry.groupBy({
    by: ["ticketTypeId"],
    where: { eventId, status: { in: ["WAITING", "OFFERED"] } },
    _count: { _all: true },
    _sum: { quantity: true },
  });
}

/**
 * Place mise en revente (RG-ATT-04, au choix de l'organisateur) : si l'événement le prévoit et que des inscrits attendent ce tarif,
 * l'annonce n'apparaît dans la section Revente publique qu'après le délai réservé, et les inscrits reçoivent le lien. Le lien du vendeur,
 * lui, fonctionne dès la mise en revente.
 */
export async function offerResaleToWaitlist(listingId: string, now = new Date()) {
  const l = await db.resaleListing.findUniqueOrThrow({
    where: { id: listingId },
    select: {
      id: true,
      linkCode: true,
      expiresAt: true,
      ticket: { select: { ticketTypeId: true, ticketType: { select: { name: true } } } },
      event: {
        select: {
          title: true,
          timezone: true,
          organizationId: true,
          resaleWaitlistFirst: true,
          resaleWaitlistMinutes: true,
          organization: { select: { name: true } },
        },
      },
    },
  });
  if (!l.event.resaleWaitlistFirst) return 0;
  const waiting = await db.waitlistEntry.findMany({
    where: { ticketTypeId: l.ticket.ticketTypeId, status: "WAITING" },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  if (waiting.length === 0) return 0;
  const until = new Date(Math.min(now.getTime() + l.event.resaleWaitlistMinutes * 60_000, l.expiresAt.getTime()));
  await db.resaleListing.update({ where: { id: l.id }, data: { publicFrom: until } });
  const brand = await emailBrandFor(l.event.organizationId).catch(() => null);
  for (const w of waiting) {
    const locale = toLocale(w.locale);
    const mail = waitlistResaleEmail({
      brand,
      locale,
      organizationName: l.event.organization.name,
      eventTitle: l.event.title,
      ticketTypeName: l.ticket.ticketType.name,
      until: formatDateTime(until, l.event.timezone, locale),
      url: resaleShortUrl(l.linkCode),
      unsubscribeUrl: unsubscribeUrl(w.token),
    });
    await sendEmail({
      to: w.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      category: "SERVICE",
      template: "waitlist.resale",
      organizationId: l.event.organizationId,
      fromName: l.event.organization.name,
    }).catch((err) => console.error("revente proposée à la liste d'attente : e-mail non envoyé", safeError(err)));
  }
  return waiting.length;
}

/** CSV pour Excel (BOM, point-virgule) : chaque cellule entre guillemets. */
const csv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map((v) => `"${csvSafe(v).replace(/"/g, '""')}"`).join(";")).join("\r\n") + "\r\n";
const dateCell = (d: Date | null | undefined, timeZone: string) =>
  d ? new Intl.DateTimeFormat("fr-BE", { timeZone, dateStyle: "short", timeStyle: "short" }).format(d) : "";

const STATUT_ATTENTE: Record<string, string> = { WAITING: "En attente", OFFERED: "Place proposée", PURCHASED: "Achetée", EXPIRED: "Offre expirée" };

/**
 * Export de la liste d'attente (RG-ATT-06) : une ligne par inscrit, son rang dans la file de son tarif, ses dates de consentement
 * et d'offre. Les désinscrits ne sont jamais exportés.
 */
export async function waitlistCsv(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  const ev = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { timezone: true, organization: { select: { timezone: true } } } });
  const tz = ev.timezone ?? ev.organization.timezone;
  const entries = await db.waitlistEntry.findMany({
    where: { eventId, status: { not: "CANCELLED" } },
    include: { ticketType: { select: { name: true } } },
    orderBy: [{ ticketTypeId: "asc" }, { createdAt: "asc" }],
  });
  const rangs = new Map<string, number>();
  const rows: unknown[][] = [
    ["Tarif", "Rang", "E-mail", "Places souhaitées", "Statut", "Inscription", "Consentement", "Offre envoyée", "Offre valable jusqu'au"],
  ];
  for (const e of entries) {
    const enFile = e.status === "WAITING" || e.status === "OFFERED";
    const rang = enFile ? (rangs.get(e.ticketTypeId) ?? 0) + 1 : null;
    if (rang) rangs.set(e.ticketTypeId, rang);
    rows.push([
      e.ticketType.name,
      rang ?? "",
      e.email,
      e.quantity,
      STATUT_ATTENTE[e.status] ?? e.status,
      dateCell(e.createdAt, tz),
      dateCell(e.consentAt, tz),
      dateCell(e.offeredAt, tz),
      dateCell(e.offerExpiresAt, tz),
    ]);
  }
  return csv(rows);
}
