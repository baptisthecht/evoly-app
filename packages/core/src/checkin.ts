import { HUMAN_ALPHABET } from "./codes";

/** Résultat d'un scan (section 9.17). */
export type ScanOutcome = "VALID" | "ALREADY_USED" | "VOID" | "WRONG_EVENT" | "INVALID";

export interface ScannableTicket {
  eventId: string;
  status: "VALID" | "CHECKED_IN" | "VOID" | "REFUNDED";
}

/** Décision pour un billet trouvé (ou non) lors d'un scan. */
export function decideCheckIn(ticket: ScannableTicket | null | undefined, eventId: string): ScanOutcome {
  if (!ticket) return "INVALID";
  if (ticket.eventId !== eventId) return "WRONG_EVENT";
  switch (ticket.status) {
    case "VALID":
      return "VALID";
    case "CHECKED_IN":
      return "ALREADY_USED";
    default:
      return "VOID";
  }
}

const SHORT_CODE = new RegExp(`^[${HUMAN_ALPHABET}]{8}$`);

/** Code court saisi à la main : majuscules, sans espaces ni tirets (« w6ue-9738 » → « W6UE9738 »). */
export function normalizeShortCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-_.]/g, "");
}

export function isShortCode(input: string): boolean {
  return SHORT_CODE.test(normalizeShortCode(input));
}

/**
 * Horodatage d'un scan hors ligne (RG-SCN-03) : l'heure de l'appareil, bornée pour qu'une horloge
 * fausse ne puisse pas antidater ou postdater un passage au-delà du raisonnable.
 */
export function trustedScanTime(deviceTime: Date | null | undefined, receivedAt: Date, maxAgeMs = 24 * 3_600_000, maxAheadMs = 5 * 60_000): Date {
  if (!deviceTime || Number.isNaN(deviceTime.getTime())) return receivedAt;
  const t = deviceTime.getTime();
  if (t > receivedAt.getTime() + maxAheadMs || t < receivedAt.getTime() - maxAgeMs) return receivedAt;
  return deviceTime;
}

/**
 * Conflit hors ligne (RG-SCN-03) : le premier scan horodaté l'emporte.
 * Un billet déjà validé plus tard que ce scan prend l'heure du scan le plus ancien.
 */
export function earliestWins(checkedInAt: Date | null, scannedAt: Date): { winner: boolean } {
  return { winner: checkedInAt == null || scannedAt.getTime() < checkedInAt.getTime() };
}

export interface AttendanceTicket {
  ticketTypeName: string;
  status: "VALID" | "CHECKED_IN" | "VOID" | "REFUNDED";
}

/** RG-SCN-09 : présents sur total, taux et répartition par tarif (billets désactivés exclus). */
export function attendance(tickets: readonly AttendanceTicket[]) {
  const live = tickets.filter((t) => t.status === "VALID" || t.status === "CHECKED_IN");
  const byType = new Map<string, { present: number; total: number }>();
  for (const t of live) {
    const row = byType.get(t.ticketTypeName) ?? { present: 0, total: 0 };
    row.total += 1;
    if (t.status === "CHECKED_IN") row.present += 1;
    byType.set(t.ticketTypeName, row);
  }
  const present = live.filter((t) => t.status === "CHECKED_IN").length;
  return { present, total: live.length, rateBps: live.length ? Math.round((present * 10_000) / live.length) : 0, byType: [...byType].map(([name, v]) => ({ name, ...v })) };
}
