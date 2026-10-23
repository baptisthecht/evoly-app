import "server-only";
import { CoreError, hasFeature } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { findEvent } from "./events";
import { type ColumnMap, detectColumns, readRows } from "./importFile";

// Import des billets vendus par un réseau, en 1 clic (docs/COMPATIBILITE_RESEAUX.md). Jamais payés par Evoly : aucune
// commission, absents des finances, des remboursements, de la revente et des e-mails ; comptés dans la jauge (contingent)
// et dans les entrées.

export type IgnoredReason = "LINE_NO_CODE" | "CODE_TOO_LONG" | "DUPLICATE_IN_FILE" | "CODE_USED_BY_OTHER_NETWORK";
export interface ImportReport {
  created: number;
  updated: number;
  unchanged: number;
  cancelled: number;
  /** Billets absents d'un fichier complet mais déjà entrés : gardés. */
  keptEntered: number;
  ignored: Array<{ line: number; reason: IgnoredReason }>;
  withoutTarif: number;
  overAllocation: Array<{ ticketType: string; allocated: number; imported: number }>;
  /** Places numérotées : place introuvable sur le plan, ou déjà vendue par Evoly (double vente). */
  seatsNotFound: number;
  seatsSoldOnEvoly: Array<{ line: number; seat: string }>;
  /** Colonnes à confirmer (une seule fois par réseau et par forme de fichier). */
  needsMapping?: { headers: string[]; sample: string[][]; guess: ColumnMap };
}
const emptyReport = (): ImportReport => ({
  created: 0,
  updated: 0,
  unchanged: 0,
  cancelled: 0,
  keptEntered: 0,
  ignored: [],
  withoutTarif: 0,
  overAllocation: [],
  seatsNotFound: 0,
  seatsSoldOnEvoly: [],
});

const MAX_PLACES_PER_LINE = 50;
const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Forme d'un fichier : ses en-têtes, pour retrouver les colonnes confirmées la fois précédente. */
const signature = (headers: string[]) => headers.map(plain).join("|");

/** « 25,00 € », « 25.5 », « 1 250,00 » → centimes ; illisible → null. */
export function priceMinorOf(raw: string): number | null {
  const s = raw.replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const decimal = /[,.](\d{1,2})$/.exec(s);
  const units = (decimal ? s.slice(0, decimal.index) : s).replace(/[,.]/g, "");
  const n = Number(units) * 100 + (decimal ? Number(decimal[1]!.padEnd(2, "0")) : 0);
  return Number.isFinite(n) && n >= 0 && n < 100_000_000 ? Math.round(n) : null;
}

/** Place indiquée par le fichier : colonnes rang et place, ou texte « Rang C place 12 », « C-12 », « C12 ». */
export function seatOf(row: string | undefined, seat: string | undefined): { row: string; label: string } | null {
  if (row && seat) return { row: row.trim(), label: seat.trim() };
  const text = (seat ?? row ?? "").trim();
  if (!text) return null;
  const words = /rang(?:ee)?\s*([a-z0-9]{1,4}).*?(?:place|siege|fauteuil|seat)\s*([a-z0-9]{1,5})/i.exec(plain(text));
  if (words) return { row: words[1]!.toUpperCase(), label: words[2]! };
  const compact = /^([a-z]{1,3})\s*[-/ ]?\s*(\d{1,4})$/i.exec(text);
  return compact ? { row: compact[1]!.toUpperCase(), label: compact[2]! } : null;
}

export async function importExternalTickets(
  ctx: OrgContext,
  eventId: string,
  distributorId: string,
  file: { name: string; bytes: Uint8Array },
  opts: { mapping?: ColumnMap; header?: boolean; fullFile?: boolean } = {},
): Promise<ImportReport> {
  if (!hasFeature(ctx.features, "DISTRIBUTION")) throw new CoreError("PRO_REQUIRED");
  const event = await findEvent(ctx, eventId);
  const distributor = await db.distributor.findFirst({ where: { id: distributorId, organizationId: ctx.organization.id, archivedAt: null } });
  if (!distributor) throw new CoreError("NOT_FOUND");
  const { rows, lines } = readRows(file.bytes, file.name);
  const detected = detectColumns(rows);
  const remembered = distributor.importMapping as { signature: string; map: ColumnMap; header: boolean } | null;
  let map: ColumnMap | null = null;
  let header = detected.header;
  if (opts.mapping) {
    map = opts.mapping;
    header = opts.header ?? true;
    await db.distributor.update({ where: { id: distributor.id }, data: { importMapping: { signature: signature(rows[0]!), map, header } } });
  } else if (remembered && remembered.signature === signature(rows[0]!)) {
    map = remembered.map;
    header = remembered.header;
  } else if (detected.sure) map = detected.map;
  if (!map || (map.code === undefined && map.reservation === undefined)) {
    return { ...emptyReport(), needsMapping: { headers: rows[0]!, sample: rows.slice(1, 4), guess: detected.map } };
  }

  const report = emptyReport();
  const cell = (r: string[], field: keyof ColumnMap) => {
    const i = map![field];
    return i === undefined ? undefined : (r[i] ?? "").trim() || undefined;
  };
  const [ticketTypes, allocations, otherCodes] = await Promise.all([
    db.ticketType.findMany({ where: { eventId }, select: { id: true, name: true } }),
    db.distributorAllocation.findMany({ where: { eventId, distributorId: distributor.id }, select: { ticketTypeId: true, quantity: true } }),
    db.externalTicket.findMany({ where: { eventId, distributorId: { not: distributor.id }, code: { not: null } }, select: { code: true } }),
  ]);
  const taken = new Set(otherCodes.map((c) => c.code!));
  const fallbackType = allocations.length === 1 ? allocations[0]!.ticketTypeId : ticketTypes.length === 1 ? ticketTypes[0]!.id : null;
  const typeOf = (label: string | undefined) => {
    if (label) {
      const l = plain(label);
      const exact = ticketTypes.find((t) => plain(t.name) === l);
      const near = exact ?? ticketTypes.find((t) => plain(t.name).includes(l) || l.includes(plain(t.name)));
      if (near) return near.id;
    }
    return fallbackType;
  };
  const seated = event.seatingMode === "ASSIGNED";
  const seats = seated
    ? await db.seat.findMany({
        where: { row: { seatingMap: { eventId } } },
        select: { id: true, label: true, status: true, distributorId: true, row: { select: { name: true } } },
      })
    : [];
  const seatByKey = new Map(seats.map((s) => [`${plain(s.row.name)}|${plain(s.label)}`, s]));

  // lignes du fichier → billets (un par place)
  type Wanted = {
    line: number;
    code: string | null;
    reservation: string | null;
    rank: number;
    holderName: string | null;
    ticketTypeId: string | null;
    priceMinor: number | null;
    seatLabel: string | null;
    seatId: string | null;
  };
  const wanted: Wanted[] = [];
  const seen = new Set<string>();
  const body = header ? rows.slice(1) : rows;
  body.forEach((r, index) => {
    const line = lines[index + (header ? 1 : 0)]!; // numéro réel dans le fichier
    const code = cell(r, "code") ?? null;
    const reservation = cell(r, "reservation") ?? null;
    if (!code && !reservation) return void report.ignored.push({ line, reason: "LINE_NO_CODE" });
    if (code && code.length > 64) return void report.ignored.push({ line, reason: "CODE_TOO_LONG" });
    if (code && taken.has(code)) return void report.ignored.push({ line, reason: "CODE_USED_BY_OTHER_NETWORK" });
    const quantity = Math.min(MAX_PLACES_PER_LINE, Math.max(1, Number.parseInt(cell(r, "quantity") ?? "1", 10) || 1));
    const name = cell(r, "fullName") ?? ([cell(r, "firstName"), cell(r, "lastName")].filter(Boolean).join(" ") || null);
    const seatText = [cell(r, "row"), cell(r, "seat")].filter(Boolean).join(" ") || null;
    const place = seatOf(cell(r, "row"), cell(r, "seat"));
    let seatId: string | null = null;
    if (seated && place) {
      const s = seatByKey.get(`${plain(place.row)}|${plain(place.label)}`);
      if (!s) report.seatsNotFound++;
      else if (s.status === "SOLD" || s.status === "HELD") report.seatsSoldOnEvoly.push({ line, seat: `${place.row} ${place.label}` });
      else seatId = s.id;
    }
    for (let rank = 1; rank <= quantity; rank++) {
      const key = code ? `c:${rank === 1 ? code : `${code}#${rank}`}` : `r:${reservation}|${rank}`;
      if (seen.has(key)) {
        if (rank === 1) report.ignored.push({ line, reason: "DUPLICATE_IN_FILE" });
        return;
      }
      seen.add(key);
      wanted.push({
        line,
        code: code ? (rank === 1 ? code : `${code}#${rank}`) : null,
        reservation,
        rank,
        holderName: name,
        ticketTypeId: typeOf(cell(r, "tarif")),
        priceMinor: cell(r, "price") ? priceMinorOf(cell(r, "price")!) : null,
        seatLabel: rank === 1 ? seatText : null,
        seatId: rank === 1 ? seatId : null,
      });
    }
  });
  report.withoutTarif = wanted.filter((w) => !w.ticketTypeId).length;

  // création ou mise à jour, sans doublon ; fichier complet : billets disparus annulés (sauf déjà entrés)
  const existing = await db.externalTicket.findMany({
    where: { eventId, distributorId: distributor.id },
    select: {
      id: true,
      code: true,
      reservation: true,
      rank: true,
      status: true,
      checkedInAt: true,
      holderName: true,
      ticketTypeId: true,
      seatLabel: true,
      seatId: true,
      priceMinor: true,
    },
  });
  const byCode = new Map(existing.filter((e) => e.code).map((e) => [e.code!, e]));
  const byReservation = new Map(existing.filter((e) => !e.code && e.reservation).map((e) => [`${e.reservation}|${e.rank}`, e]));
  const kept = new Set<string>();
  const toCreate: Wanted[] = [];
  await db.$transaction(
    async (tx) => {
      for (const w of wanted) {
        const e = w.code ? byCode.get(w.code) : byReservation.get(`${w.reservation}|${w.rank}`);
        if (!e) {
          toCreate.push(w);
          continue;
        }
        kept.add(e.id);
        const data = {
          holderName: w.holderName ?? e.holderName,
          ticketTypeId: w.ticketTypeId ?? e.ticketTypeId,
          seatLabel: w.seatLabel ?? e.seatLabel,
          seatId: w.seatId ?? e.seatId,
          priceMinor: w.priceMinor ?? e.priceMinor,
          reservation: w.reservation ?? e.reservation,
          status: "VALID" as const,
        };
        const same =
          data.holderName === e.holderName &&
          data.ticketTypeId === e.ticketTypeId &&
          data.seatLabel === e.seatLabel &&
          data.seatId === e.seatId &&
          data.priceMinor === e.priceMinor &&
          e.status === "VALID";
        if (same) report.unchanged++;
        else {
          await tx.externalTicket.update({ where: { id: e.id }, data });
          report.updated++;
        }
      }
      for (let i = 0; i < toCreate.length; i += 1000) {
        const chunk = toCreate.slice(i, i + 1000);
        const r = await tx.externalTicket.createMany({
          data: chunk.map((w) => ({
            eventId,
            distributorId: distributor.id,
            code: w.code,
            reservation: w.reservation,
            rank: w.rank,
            holderName: w.holderName,
            ticketTypeId: w.ticketTypeId,
            seatLabel: w.seatLabel,
            seatId: w.seatId,
            priceMinor: w.priceMinor,
          })),
          skipDuplicates: true,
        });
        report.created += r.count;
      }
      // place vendue par le réseau : retirée de la vente en ligne, marquée du réseau
      const seatIds = wanted.map((w) => w.seatId).filter((s): s is string => !!s);
      if (seatIds.length)
        await tx.seat.updateMany({
          where: { id: { in: seatIds }, status: { in: ["AVAILABLE", "BLOCKED"] } },
          data: { status: "BLOCKED", distributorId: distributor.id },
        });
      if (opts.fullFile) {
        for (const e of existing) {
          if (kept.has(e.id) || e.status !== "VALID") continue;
          if (e.checkedInAt) report.keptEntered++;
          else {
            await tx.externalTicket.update({ where: { id: e.id }, data: { status: "CANCELLED" } });
            report.cancelled++;
          }
        }
      }
    },
    { timeout: 60_000 },
  );

  // dépassement de contingent : signalé, jamais bloquant (les billets ont été vendus)
  const counts = await db.externalTicket.groupBy({
    by: ["ticketTypeId"],
    where: { eventId, distributorId: distributor.id, status: "VALID" },
    _count: { _all: true },
  });
  for (const a of allocations) {
    const imported = counts.find((c) => c.ticketTypeId === a.ticketTypeId)?._count._all ?? 0;
    if (imported > a.quantity)
      report.overAllocation.push({ ticketType: ticketTypes.find((t) => t.id === a.ticketTypeId)?.name ?? "", allocated: a.quantity, imported });
  }
  await audit({
    action: "distributor.tickets_imported",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Distributor",
    targetId: distributor.id,
    metadata: { eventId, created: report.created, updated: report.updated, cancelled: report.cancelled, ignored: report.ignored.length },
  });
  return report;
}
