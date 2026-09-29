import "server-only";
import { effectiveEnd } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import { inkOn } from "@evoly/ui";
import { db } from "@/lib/db";
import { findOrderIdByToken } from "../checkout";
import { emailBrandFor } from "../email/brand";

export interface WalletTicket {
  ticketId: string;
  code: string;
  shortCode: string;
  typeName: string;
  holder: string | null;
  seat: string | null;
  reference: string;
  eventId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  when: string;
  place: string;
  address: { line: string | null; postalCode: string | null; city: string | null; country: string | null };
  organizationName: string;
  locale: Locale;
  background: string;
  foreground: string;
}

/** US-POST-03 : données d'un billet valable, trouvé par le lien personnel de l'acheteur (jamais par son seul identifiant). */
export async function walletTicket(token: string, ticketId: string): Promise<WalletTicket | null> {
  const orderId = await findOrderIdByToken(token);
  if (!orderId) return null;
  const t = await db.ticket.findFirst({
    where: { id: ticketId, orderId, status: { in: ["VALID", "CHECKED_IN"] }, order: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } },
    include: { ticketType: { select: { name: true } }, seat: { select: { label: true, row: { select: { name: true } } } }, order: { select: { reference: true, buyerLocale: true, organizationId: true } }, event: { select: { id: true, title: true, startsAt: true, endsAt: true, timezone: true, locationName: true, city: true, addressLine1: true, postalCode: true, country: true } } },
  });
  if (!t) return null;
  const brand = await emailBrandFor(t.order.organizationId);
  const locale = (t.order.buyerLocale === "en" ? "en" : "fr") as Locale;
  const background = brand.primary ?? "#222222";
  return {
    ticketId: t.id,
    code: t.code,
    shortCode: t.shortCode,
    typeName: t.ticketType.name,
    holder: t.holderFirstName ? `${t.holderFirstName} ${t.holderLastName ?? ""}`.trim() : null,
    seat: t.seat ? `${t.seat.row.name} · ${t.seat.label}` : null,
    reference: t.order.reference,
    eventId: t.event.id,
    title: t.event.title,
    startsAt: t.event.startsAt,
    endsAt: effectiveEnd(t.event.startsAt, t.event.endsAt),
    when: formatDateTime(t.event.startsAt, t.event.timezone, locale, "long"),
    place: [t.event.locationName, t.event.city].filter(Boolean).join(", "),
    address: { line: t.event.addressLine1, postalCode: t.event.postalCode, city: t.event.city, country: t.event.country },
    organizationName: brand.fromName,
    locale,
    background,
    foreground: inkOn(background),
  };
}

export const rgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
