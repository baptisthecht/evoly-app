import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { appleCredentials, applePassToken, buildPkpass } from "./apple";
import { walletFingerprint, walletTicketById } from "./ticket";

/** Service web Apple Wallet (RG-POST-04) : chaque requête porte « ApplePass <jeton> », propre au billet. */
export function passAuthorized(serial: string, header: string | null): boolean {
  const given = Buffer.from((header ?? "").replace(/^ApplePass\s+/i, ""));
  const expected = Buffer.from(applePassToken(serial));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Un téléphone s'inscrit aux mises à jour d'un pass ; l'empreinte de départ évite une notification inutile. */
export async function registerDevice(device: string, serial: string, pushToken: string): Promise<"CREATED" | "EXISTS" | "UNKNOWN"> {
  const t = await walletTicketById(serial);
  if (!t) return "UNKNOWN";
  const where = { deviceLibraryIdentifier_ticketId: { deviceLibraryIdentifier: device, ticketId: serial } };
  const existing = await db.walletRegistration.findUnique({ where });
  await db.walletRegistration.upsert({ where, create: { deviceLibraryIdentifier: device, ticketId: serial, pushToken }, update: { pushToken } });
  await db.ticket.updateMany({ where: { id: serial, walletHash: null }, data: { walletHash: walletFingerprint(t), walletUpdatedAt: new Date() } });
  return existing ? "EXISTS" : "CREATED";
}

export async function unregisterDevice(device: string, serial: string) {
  await db.walletRegistration.deleteMany({ where: { deviceLibraryIdentifier: device, ticketId: serial } });
}

/** Passes de ce téléphone modifiés depuis sa dernière synchronisation ; null : rien de nouveau. */
export async function updatedSerials(device: string, since: string | null) {
  const after = since && Number.isFinite(Date.parse(since)) ? new Date(since) : null;
  const regs = await db.walletRegistration.findMany({
    where: { deviceLibraryIdentifier: device },
    select: { ticket: { select: { id: true, walletUpdatedAt: true } } },
  });
  const changed = regs.map((r) => r.ticket).filter((t) => t.walletUpdatedAt && (!after || t.walletUpdatedAt > after));
  if (changed.length === 0) return null;
  const last = new Date(Math.max(...changed.map((t) => t.walletUpdatedAt!.getTime())));
  return { serialNumbers: changed.map((t) => t.id), lastUpdated: last.toISOString() };
}

/** Dernière version du pass, annulé si le billet a été désactivé. */
export async function latestPass(serial: string) {
  const creds = appleCredentials();
  const t = await walletTicketById(serial);
  if (!creds || !t) return null;
  const tk = await db.ticket.findUnique({ where: { id: serial }, select: { walletUpdatedAt: true } });
  return { bytes: buildPkpass(t, creds), lastModified: tk?.walletUpdatedAt ?? new Date() };
}
