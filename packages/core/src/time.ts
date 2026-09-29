import { CoreError } from "./errors";

/** Décalage (en minutes) d'un fuseau à un instant donné, calculé avec Intl. */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Heure saisie dans le fuseau de l'événement (« 2026-11-14T20:00 », champ datetime-local) vers un instant UTC.
 * Heure inexistante (passage à l'heure d'été) : décalée après le saut. Heure ambiguë (passage à l'heure d'hiver) : la première.
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const m = LOCAL.exec(local);
  if (!m) throw new CoreError("INVALID_DATETIME", `date invalide : ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) throw new CoreError("INVALID_DATETIME", `date invalide : ${local}`);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (new Date(wall).getUTCDate() !== d) throw new CoreError("INVALID_DATETIME", `date invalide : ${local}`);
  // décalages de part et d'autre d'un éventuel changement d'heure
  const before = timeZoneOffsetMinutes(new Date(wall - 86_400_000), timeZone);
  const after = timeZoneOffsetMinutes(new Date(wall + 86_400_000), timeZone);
  const candidates = [...new Set([wall - before * 60_000, wall - after * 60_000])].sort((a, b) => a - b);
  const valid = candidates.filter((c) => utcToZonedLocal(new Date(c), timeZone) === local);
  if (valid.length > 0) return new Date(valid[0]!); // heure ambiguë : la première
  return new Date(wall - before * 60_000); // heure inexistante : décalée après le saut
}

/** Instant UTC vers la valeur d'un champ datetime-local dans le fuseau donné. */
export function utcToZonedLocal(date: Date, timeZone: string): string {
  const shifted = new Date(date.getTime() + timeZoneOffsetMinutes(date, timeZone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** RG-EVT-06 : fin effective d'un événement (fin saisie, sinon début + 6 heures). */
export function effectiveEnd(startsAt: Date, endsAt?: Date | null): Date {
  return endsAt ?? new Date(startsAt.getTime() + 6 * 3_600_000);
}
