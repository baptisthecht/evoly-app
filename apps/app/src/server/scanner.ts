import "server-only";
import { createHash, createHmac } from "node:crypto";
import { attendance, CoreError, decideCheckIn, earliestWins, effectiveEnd, humanCode, normalizeShortCode, trustedScanTime, utcToZonedLocal, zonedLocalToUtc, type ScanOutcome } from "@evoly/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { findEvent } from "./events";
import { cancelListingsForTicket } from "./resale";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const PERSONAL = "member:"; // préfixe du libellé d'un lien personnel de membre (US-SCN-06)

/** Jeton d'un lien bénévole, dérivé d'un secret serveur : réaffichable, jamais stocké en clair. */
export function scannerToken(linkId: string): string {
  const e = env();
  return createHmac("sha256", e.ORDER_TOKEN_SECRET ?? e.BETTER_AUTH_SECRET).update(`evoly-scanner:${linkId}`).digest("base64url");
}
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function scannerUrl(linkId: string): string {
  const protocol = new URL(env().NEXT_PUBLIC_APP_URL).protocol;
  return `${protocol}//scanner.${env().NEXT_PUBLIC_BASE_DOMAIN}/s/${scannerToken(linkId)}`;
}

export type LinkDuration = "EVENT_DAY" | "24H" | "48H" | "CUSTOM";

function expiryFor(duration: LinkDuration, event: { startsAt: Date; endsAt: Date | null; timezone: string }, now: Date, customLocal?: string | null): Date {
  if (duration === "24H") return new Date(now.getTime() + 24 * 3_600_000);
  if (duration === "48H") return new Date(now.getTime() + 48 * 3_600_000);
  if (duration === "CUSTOM") {
    if (!customLocal) throw new CoreError("EXPIRY_REQUIRED");
    const at = zonedLocalToUtc(customLocal, event.timezone);
    if (at <= now) throw new CoreError("EXPIRY_IN_THE_PAST");
    return at;
  }
  // jour J : jusqu'à la fin de la journée de l'événement, ou deux heures après sa fin s'il finit plus tard
  const endOfDay = zonedLocalToUtc(`${utcToZonedLocal(event.startsAt, event.timezone).slice(0, 10)}T23:59`, event.timezone);
  const afterEnd = new Date(effectiveEnd(event.startsAt, event.endsAt).getTime() + 2 * 3_600_000);
  return new Date(Math.max(endOfDay.getTime(), afterEnd.getTime(), now.getTime() + 3_600_000));
}

/** US-SCN-01 : lien temporaire pour un bénévole, sans compte Evoly. */
export async function createScannerLink(ctx: OrgContext, eventId: string, input: { label: string; duration: LinkDuration; expiresAtLocal?: string | null; allowManualSearch: boolean }, now = new Date()) {
  const event = await findEvent(ctx, eventId);
  const id = `c${humanCode(24, ID_ALPHABET)}`;
  const link = await db.scannerLink.create({
    data: { id, eventId, tokenHash: sha256(scannerToken(id)), label: input.label.trim(), allowManualSearch: input.allowManualSearch, expiresAt: expiryFor(input.duration, event, now, input.expiresAtLocal), createdById: ctx.user.id },
  });
  await audit({ action: "scanner_link.created", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "ScannerLink", targetId: link.id, metadata: { label: link.label } });
  return link;
}

/** US-SCN-06 : lien personnel d'un membre autorisé, réutilisé tant qu'il est valable. */
export async function personalScannerLink(ctx: OrgContext, eventId: string, now = new Date()) {
  const event = await findEvent(ctx, eventId);
  const label = `${PERSONAL}${ctx.user.id}`;
  const existing = await db.scannerLink.findFirst({ where: { eventId, label, revokedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } });
  if (existing) return existing;
  const id = `c${humanCode(24, ID_ALPHABET)}`;
  return db.scannerLink.create({ data: { id, eventId, tokenHash: sha256(scannerToken(id)), label, allowManualSearch: true, expiresAt: expiryFor("EVENT_DAY", event, now), createdById: ctx.user.id } });
}

export async function revokeScannerLink(ctx: OrgContext, eventId: string, linkId: string) {
  await findEvent(ctx, eventId);
  const link = await db.scannerLink.findFirst({ where: { id: linkId, eventId } });
  if (!link) throw new CoreError("NOT_FOUND");
  await db.scannerLink.update({ where: { id: link.id }, data: { revokedAt: link.revokedAt ?? new Date() } });
  await audit({ action: "scanner_link.revoked", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "ScannerLink", targetId: link.id });
}

export async function listScannerLinks(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  const links = await db.scannerLink.findMany({ where: { eventId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { checkIns: true } }, createdBy: { select: { name: true } } } });
  return links.map((l) => ({ ...l, personal: l.label.startsWith(PERSONAL), displayLabel: l.label.startsWith(PERSONAL) ? l.createdBy.name : l.label, url: scannerUrl(l.id) }));
}

/** Libellé affiché d'une entrée : le nom du membre pour un lien personnel. */
async function gateLabel(link: { label: string; createdById: string }): Promise<string> {
  if (!link.label.startsWith(PERSONAL)) return link.label;
  return (await db.user.findUnique({ where: { id: link.createdById }, select: { name: true } }))?.name ?? "";
}

export type LinkState = "OK" | "EXPIRED" | "REVOKED";

/** RG-SCN-05 : un lien expiré ou révoqué ne donne plus accès à rien. */
export async function resolveScannerLink(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const link = await db.scannerLink.findUnique({ where: { tokenHash: sha256(token) }, include: { event: { select: { id: true, title: true, startsAt: true, endsAt: true, timezone: true, locationName: true, city: true, organizationId: true } } } });
  if (!link) return null;
  const state: LinkState = link.revokedAt ? "REVOKED" : link.expiresAt <= now ? "EXPIRED" : "OK";
  return { link, state };
}

export type ResolvedLink = NonNullable<Awaited<ReturnType<typeof resolveScannerLink>>>["link"];

/** RG-SCN-03 : liste locale du scanner. Codes hachés avec un sel propre au lien, aucune donnée financière (RG-SCN-06). */
export async function scannerManifest(link: ResolvedLink) {
  const tickets = await db.ticket.findMany({
    where: { eventId: link.eventId },
    select: { id: true, code: true, shortCode: true, status: true, checkedInAt: true, voidReason: true, holderFirstName: true, holderLastName: true, ticketType: { select: { name: true } }, order: { select: { buyerFirstName: true, buyerLastName: true, buyerEmail: true } } },
    orderBy: { createdAt: "asc" },
  });
  const salt = link.id;
  return {
    serverTime: new Date().toISOString(),
    salt,
    event: { title: link.event.title, startsAt: link.event.startsAt.toISOString(), timezone: link.event.timezone, place: link.event.locationName ?? link.event.city },
    link: { label: await gateLabel(link), allowManualSearch: link.allowManualSearch, expiresAt: link.expiresAt.toISOString() },
    tickets: tickets.map((t) => ({
      id: t.id,
      codeHash: sha256(`${salt}:${t.code}`),
      shortCode: t.shortCode,
      holder: t.holderFirstName ? `${t.holderFirstName} ${t.holderLastName ?? ""}`.trim() : `${t.order.buyerFirstName} ${t.order.buyerLastName}`.trim(),
      buyer: `${t.order.buyerFirstName} ${t.order.buyerLastName}`.trim(),
      emailHash: sha256(`${salt}:${t.order.buyerEmail.toLowerCase()}`),
      typeName: t.ticketType.name,
      status: t.status,
      checkedInAt: t.checkedInAt?.toISOString() ?? null,
      voidReason: t.voidReason,
    })),
  };
}

export interface ScanInput {
  code?: string | null;
  shortCode?: string | null;
  ticketId?: string | null;
  method: "QR" | "MANUAL_CODE" | "LIST";
  scannedAt?: string | null;
  deviceId?: string | null;
  offline?: boolean;
}

export interface ScanResult {
  result: ScanOutcome;
  ticket: { id: string; holder: string; typeName: string; status: string; checkedInAt: string | null; voidReason: string | null } | null;
  firstScan: { at: string; gate: string | null } | null;
  otherEvent: string | null;
}

/**
 * Passage d'un billet (RG-SCN-01, RG-SCN-02) : mise à jour conditionnelle, deux scanners ne valident jamais
 * le même billet ; chaque tentative est inscrite au journal, immuable.
 */
export async function checkIn(link: ResolvedLink, input: ScanInput, receivedAt = new Date()): Promise<ScanResult> {
  if (input.method === "LIST" && !link.allowManualSearch) throw new CoreError("MANUAL_SEARCH_DISABLED");
  const include = { ticketType: { select: { name: true } }, order: { select: { buyerFirstName: true, buyerLastName: true } }, event: { select: { title: true } } } as const;
  const ticket = input.code
    ? await db.ticket.findUnique({ where: { code: input.code.trim() }, include })
    : input.shortCode
      ? await db.ticket.findUnique({ where: { eventId_shortCode: { eventId: link.eventId, shortCode: normalizeShortCode(input.shortCode) } }, include })
      : input.ticketId
        ? await db.ticket.findFirst({ where: { id: input.ticketId, eventId: link.eventId }, include })
        : null;
  const at = input.offline ? trustedScanTime(input.scannedAt ? new Date(input.scannedAt) : null, receivedAt) : receivedAt;
  const gate = await gateLabel(link);
  const logData = (result: ScanOutcome) => ({
    eventId: link.eventId,
    ticketId: ticket?.eventId === link.eventId ? ticket.id : null,
    scannerLinkId: link.id,
    userId: link.label.startsWith(PERSONAL) ? link.createdById : null,
    result,
    method: input.method,
    gate,
    deviceId: input.deviceId?.slice(0, 64) ?? null,
    scannedAt: at,
    offline: !!input.offline,
  });
  let result = decideCheckIn(ticket, link.eventId);
  let checkedInAt = ticket?.checkedInAt ?? null;
  let logged = false;
  if (ticket && result === "VALID") {
    // passage et journal dans la même transaction : un scan concurrent attend, puis trouve ce premier passage
    const won = await db.$transaction(async (tx) => {
      const n = await tx.$executeRaw`UPDATE "Ticket" SET status = 'CHECKED_IN', "checkedInAt" = ${at}, "updatedAt" = now() WHERE id = ${ticket.id} AND status = 'VALID'`;
      if (n === 1) await tx.checkIn.create({ data: logData("VALID") });
      return n === 1;
    });
    if (won) {
      checkedInAt = at;
      logged = true;
    } else {
      const fresh = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { status: true, checkedInAt: true } });
      result = decideCheckIn({ eventId: ticket.eventId, status: fresh.status }, link.eventId);
      checkedInAt = fresh.checkedInAt;
    }
  } else if (ticket && result === "ALREADY_USED" && input.offline && earliestWins(ticket.checkedInAt, at).winner) {
    // RG-SCN-03 : un scan hors ligne plus ancien l'emporte, le billet prend son heure
    const earlier = await db.$executeRaw`UPDATE "Ticket" SET "checkedInAt" = ${at}, "updatedAt" = now() WHERE id = ${ticket.id} AND status = 'CHECKED_IN' AND "checkedInAt" > ${at}`;
    if (earlier === 1) {
      result = "VALID";
      checkedInAt = at;
    }
  }
  if (!logged) await db.checkIn.create({ data: logData(result) });
  if (logged && ticket) await cancelListingsForTicket(ticket.id); // billet utilisé : son annonce de revente est retirée (RG-RSL-01)
  if (!link.lastUsedAt || receivedAt.getTime() - link.lastUsedAt.getTime() > 60_000) await db.scannerLink.update({ where: { id: link.id }, data: { lastUsedAt: receivedAt } });
  let firstScan: ScanResult["firstScan"] = null;
  if (result === "ALREADY_USED" && ticket) {
    const first = await db.checkIn.findFirst({ where: { ticketId: ticket.id, result: "VALID" }, orderBy: { scannedAt: "asc" }, select: { scannedAt: true, gate: true } });
    firstScan = { at: (first?.scannedAt ?? checkedInAt ?? at).toISOString(), gate: first?.gate ?? null };
  }
  const sameEvent = ticket && ticket.eventId === link.eventId;
  return {
    result,
    ticket: sameEvent
      ? { id: ticket.id, holder: ticket.holderFirstName ? `${ticket.holderFirstName} ${ticket.holderLastName ?? ""}`.trim() : `${ticket.order.buyerFirstName} ${ticket.order.buyerLastName}`.trim(), typeName: ticket.ticketType.name, status: result === "VALID" ? "CHECKED_IN" : ticket.status, checkedInAt: checkedInAt?.toISOString() ?? null, voidReason: ticket.voidReason }
      : null,
    firstScan,
    otherEvent: result === "WRONG_EVENT" && ticket ? ticket.event.title : null,
  };
}

/** Synchronisation des scans hors ligne, dans l'ordre de leurs horodatages. */
export async function syncScans(link: ResolvedLink, scans: Array<ScanInput & { clientId: string }>) {
  const ordered = [...scans].sort((a, b) => new Date(a.scannedAt ?? 0).getTime() - new Date(b.scannedAt ?? 0).getTime());
  const results: Array<{ clientId: string } & ScanResult> = [];
  for (const s of ordered) results.push({ clientId: s.clientId, ...(await checkIn(link, { ...s, offline: true })) });
  return results;
}

/** RG-SCN-09 : présents, taux, répartition par tarif et par entrée, 20 derniers scans. */
export async function attendanceStats(eventId: string) {
  const [tickets, byGate, recent] = await Promise.all([
    db.ticket.findMany({ where: { eventId }, select: { status: true, ticketType: { select: { name: true } } } }),
    db.checkIn.groupBy({ by: ["gate"], where: { eventId, result: "VALID" }, _count: { _all: true } }),
    db.checkIn.findMany({ where: { eventId }, orderBy: { receivedAt: "desc" }, take: 20, include: { ticket: { select: { holderFirstName: true, holderLastName: true, ticketType: { select: { name: true } }, order: { select: { buyerFirstName: true, buyerLastName: true } } } } } }),
  ]);
  return {
    ...attendance(tickets.map((t) => ({ ticketTypeName: t.ticketType.name, status: t.status }))),
    byGate: byGate.map((g) => ({ gate: g.gate ?? "—", count: g._count._all })).sort((a, b) => b.count - a.count),
    recent: recent.map((c) => ({ id: c.id, at: c.scannedAt, result: c.result, gate: c.gate, offline: c.offline, holder: c.ticket ? (c.ticket.holderFirstName ? `${c.ticket.holderFirstName} ${c.ticket.holderLastName ?? ""}`.trim() : `${c.ticket.order.buyerFirstName} ${c.ticket.order.buyerLastName}`.trim()) : null, typeName: c.ticket?.ticketType.name ?? null })),
  };
}

/**
 * RG-SCN-02 (P1) : un membre avec CHECKIN_MANAGE annule une entrée validée par erreur, avec un motif.
 * Le journal reste immuable : l'annulation y est ajoutée (REVERTED), le billet redevient valable.
 */
export async function revertCheckIn(ctx: OrgContext, ticketId: string, note: string) {
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, event: { organizationId: ctx.organization.id } }, select: { id: true, eventId: true, status: true } });
  if (!ticket) throw new CoreError("NOT_FOUND");
  const reason = note.trim().slice(0, 300);
  if (reason.length < 3) throw new CoreError("CHECKIN_REVERT_REASON");
  await db.$transaction(async (tx) => {
    const done = await tx.ticket.updateMany({ where: { id: ticket.id, status: "CHECKED_IN" }, data: { status: "VALID", checkedInAt: null } });
    if (done.count === 0) throw new CoreError("CHECKIN_NOT_REVERTIBLE");
    await tx.checkIn.create({ data: { eventId: ticket.eventId, ticketId: ticket.id, userId: ctx.user.id, result: "REVERTED", method: "MANUAL_CODE", scannedAt: new Date(), note: reason } });
  });
  await audit({ action: "checkin.reverted", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Ticket", targetId: ticket.id, metadata: { reason } });
}
