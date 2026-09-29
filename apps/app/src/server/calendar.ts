import { effectiveEnd } from "@evoly/core";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** Fichier ICS d'un événement (section 9.12) : ajouté à l'e-mail et téléchargeable depuis la page des billets. */
export function eventIcs(e: { id: string; title: string; summary: string | null; startsAt: Date; endsAt: Date | null; locationType: string; locationName: string | null; addressLine1: string | null; postalCode: string | null; city: string | null; onlineUrl: string | null }, uid: string): string {
  const location = e.locationType === "ONLINE" ? (e.onlineUrl ?? "") : [e.locationName, e.addressLine1, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Evoly//Billetterie//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@evoly.me`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(effectiveEnd(e.startsAt, e.endsAt))}`,
    `SUMMARY:${escape(e.title)}`,
    location ? `LOCATION:${escape(location)}` : "",
    e.summary ? `DESCRIPTION:${escape(e.summary)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n")
    .concat("\r\n");
}
