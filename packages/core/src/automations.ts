import { utcToZonedLocal, zonedLocalToUtc } from "./time";

export type ReminderType = "REMINDER_J7" | "REMINDER_J1" | "REMINDER_J0";
const SCHEDULE: Record<ReminderType, { daysBefore: number; time: string }> = {
  REMINDER_J7: { daysBefore: 7, time: "10:00" },
  REMINDER_J1: { daysBefore: 1, time: "10:00" },
  REMINDER_J0: { daysBefore: 0, time: "08:00" },
};

/** Section 9.18 : heure d'envoi d'un rappel, dans le fuseau de l'événement (J-7 et J-1 à 10 h, jour J à 8 h). */
export function reminderSendAt(startsAt: Date, timeZone: string, type: ReminderType): Date {
  const day = utcToZonedLocal(startsAt, timeZone).slice(0, 10);
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - SCHEDULE[type].daysBefore);
  return zonedLocalToUtc(`${d.toISOString().slice(0, 10)}T${SCHEDULE[type].time}`, timeZone);
}

/**
 * Rappel à envoyer maintenant : heure atteinte, événement pas encore commencé (RG-MKT-06), et pas plus de 6 heures
 * de retard (un événement publié la veille ne reçoit pas un rappel J-7 tardif).
 */
export function reminderDue(sendAt: Date, startsAt: Date, now: Date, graceHours = 6): boolean {
  return now >= sendAt && now < startsAt && now.getTime() - sendAt.getTime() < graceHours * 3_600_000;
}

/** US-MKT-02 : remerciement 2 heures après la fin, envoyé au plus tard 24 heures après cette heure prévue. */
export function postEventDue(end: Date, now: Date): boolean {
  const at = end.getTime() + 2 * 3_600_000;
  return now.getTime() >= at && now.getTime() < at + 24 * 3_600_000;
}

/** « Dernières places » : moins de 10 % de la jauge restante, sans être complet ; jamais pour une jauge illimitée. */
export function lastSeatsReached(o: { capacity: number | null; sold: number }): boolean {
  if (!o.capacity || o.capacity <= 0) return false;
  const remaining = o.capacity - o.sold;
  return remaining > 0 && remaining < o.capacity * 0.1;
}

/** Jauge d'un événement : la jauge globale, sinon la somme des quantités des tarifs (null si un tarif est illimité). */
export function eventCapacity(capacity: number | null, ticketTypeQuantities: ReadonlyArray<number | null>): number | null {
  if (capacity != null) return capacity;
  if (ticketTypeQuantities.length === 0 || ticketTypeQuantities.some((q) => q == null)) return null;
  return ticketTypeQuantities.reduce<number>((n, q) => n + (q ?? 0), 0);
}
