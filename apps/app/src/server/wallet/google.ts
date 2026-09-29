import "server-only";
import { createSign } from "node:crypto";
import { env } from "@/lib/env";
import type { WalletTicket } from "./ticket";

export interface GoogleCredentials {
  issuerId: string;
  serviceAccountEmail: string;
  privateKeyPem: string;
}

export function googleCredentials(): GoogleCredentials | null {
  const e = env();
  if (!e.GOOGLE_WALLET_ISSUER_ID || !e.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL || !e.GOOGLE_WALLET_PRIVATE_KEY) return null;
  return { issuerId: e.GOOGLE_WALLET_ISSUER_ID, serviceAccountEmail: e.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL, privateKeyPem: Buffer.from(e.GOOGLE_WALLET_PRIVATE_KEY, "base64").toString("utf8") };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");
const text = (value: string, language: string) => ({ defaultValue: { language, value } });

/** Contenu du jeton « Enregistrer dans Google Wallet » : classe de l'événement et billet (format eventTicket). */
export function googleWalletClaims(t: WalletTicket, creds: Pick<GoogleCredentials, "issuerId" | "serviceAccountEmail">, origin: string, now = new Date()) {
  const lang = t.locale === "en" ? "en" : "fr";
  const classId = `${creds.issuerId}.evoly_event_${t.eventId}`;
  return {
    iss: creds.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(now.getTime() / 1000),
    origins: [origin],
    payload: {
      eventTicketClasses: [
        {
          id: classId,
          issuerName: t.organizationName,
          reviewStatus: "UNDER_REVIEW",
          eventName: text(t.title, lang),
          ...(t.place ? { venue: { name: text(t.place, lang), address: text([t.address.line, [t.address.postalCode, t.address.city].filter(Boolean).join(" "), t.address.country].filter(Boolean).join(", ") || t.place, lang) } } : {}),
          dateTime: { start: t.startsAt.toISOString(), end: t.endsAt.toISOString() },
          hexBackgroundColor: t.background,
        },
      ],
      eventTicketObjects: [
        {
          id: `${creds.issuerId}.evoly_ticket_${t.ticketId}`,
          classId,
          state: "ACTIVE",
          barcode: { type: "QR_CODE", value: t.code, alternateText: t.shortCode },
          ticketType: text(t.typeName, lang),
          ...(t.holder ? { ticketHolderName: t.holder } : {}),
          reservationInfo: { confirmationCode: t.reference },
          validTimeInterval: { end: { date: new Date(t.endsAt.getTime() + 24 * 3_600_000).toISOString() } },
        },
      ],
    },
  };
}

/** US-POST-03 : lien d'enregistrement Google Wallet (jeton RS256 signé par le compte de service). */
export function googleSaveUrl(t: WalletTicket, creds: GoogleCredentials, origin: string, now = new Date()): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(googleWalletClaims(t, creds, origin, now)));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(creds.privateKeyPem);
  return `https://pay.google.com/gp/v/save/${head}.${body}.${b64url(sig)}`;
}
