import { effectiveEnd } from "@evoly/core";
import { isPrepublished, salesOpeningAt } from "@evoly/core";
import { toLocale, type Locale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { eventPublicUrl } from "./urls";

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const escape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/([,;])/g, "\\$1")
    .replace(/\r?\n/g, "\\n");

/** Fichier ICS d'un événement (section 9.12) : ajouté à l'e-mail et téléchargeable depuis la page des billets. */
export function eventIcs(
  e: {
    id: string;
    title: string;
    summary: string | null;
    startsAt: Date;
    endsAt: Date | null;
    locationType: string;
    locationName: string | null;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    onlineUrl: string | null;
  },
  uid: string,
): string {
  const location =
    e.locationType === "ONLINE"
      ? (e.onlineUrl ?? "")
      : [e.locationName, e.addressLine1, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
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

/** Ajout à l'agenda de l'ouverture des ventes (RG-PRG-05) : fichier iCalendar (RFC 5545) et lien Google Agenda. */
const OPEN: Record<Locale, string> = {
  fr: "Ouverture des ventes",
  en: "Tickets on sale",
  es: "Apertura de la venta",
  de: "Verkaufsstart",
  it: "Apertura delle vendite",
  pt: "Abertura das vendas",
  nl: "Start van de verkoop",
};
const SOON: Record<Locale, string> = {
  fr: "Événement à venir",
  en: "Coming soon",
  es: "Próximamente",
  de: "Demnächst",
  it: "Prossimamente",
  pt: "Brevemente",
  nl: "Binnenkort",
};

/** Titre de l'agenda : jamais le vrai titre d'un événement encore présenté par une annonce. */
export function calendarTitle(o: { locale: Locale; prepublished: boolean; teaserText: string | null; eventTitle: string; organizationName: string }) {
  if (o.prepublished) return `${o.teaserText ?? SOON[o.locale]} · ${o.organizationName}`;
  return `${OPEN[o.locale]}${o.locale === "fr" ? " : " : ": "}${o.eventTitle}`;
}

const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const escText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Pliage des lignes à 75 octets (RFC 5545, 3.1), sans couper un caractère UTF-8. */
function foldLine(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (Buffer.byteLength(cur + ch, "utf8") > limit) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function openingIcs(o: { uid: string; title: string; start: Date; url: string; now?: Date }) {
  const end = new Date(o.start.getTime() + 30 * 60_000);
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Evoly//Ouverture des ventes//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${o.uid}@evoly.me`,
      `DTSTAMP:${utcStamp(o.now ?? new Date())}`,
      `DTSTART:${utcStamp(o.start)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escText(o.title)}`,
      `URL:${o.url}`,
      `DESCRIPTION:${escText(o.url)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT10M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escText(o.title)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(foldLine)
      .join("\r\n") + "\r\n"
  );
}

export function googleCalendarUrl(o: { title: string; start: Date; url: string }) {
  const end = new Date(o.start.getTime() + 30 * 60_000);
  const q = new URLSearchParams({ action: "TEMPLATE", text: o.title, dates: `${utcStamp(o.start)}/${utcStamp(end)}`, details: o.url });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Données d'agenda d'un événement : rien pour un événement privé, invisible avant publication ou déjà en vente. */
export async function openingCalendar(eventId: string, lang: string, now = new Date()) {
  const e = await db.event.findFirst({
    where: { id: eventId, deletedAt: null, status: "PUBLISHED", visibility: { not: "PRIVATE" } },
    include: { organization: { select: { name: true, slug: true, subdomain: true } } },
  });
  if (!e) return null;
  const prepublished = isPrepublished(e, now);
  if (prepublished && e.prePublishMode === "HIDDEN") return null;
  const start = salesOpeningAt(e);
  if (!start || start <= now) return null;
  const locale = toLocale(lang);
  return {
    uid: `ouverture-${e.id}`,
    title: calendarTitle({ locale, prepublished, teaserText: e.teaserText, eventTitle: e.title, organizationName: e.organization.name }),
    start,
    url: eventPublicUrl(e.organization, e),
  };
}
