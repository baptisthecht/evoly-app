import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CoreError } from "@evoly/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";

const secret = () => env().ORDER_TOKEN_SECRET ?? env().BETTER_AUTH_SECRET;
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", `unsubscribe:${secret()}`).update(payload).digest("base64url").slice(0, 32);

/** Lien de désinscription signé, sans connexion (US-MKT-05, RG-MKT-02). */
export function unsubscribeToken(email: string, organizationId: string, eventId?: string | null, campaignId?: string | null): string {
  const payload = b64(
    JSON.stringify({ e: email.toLowerCase(), o: organizationId, ...(eventId ? { v: eventId } : {}), ...(campaignId ? { c: campaignId } : {}) }),
  );
  return `${payload}.${sign(payload)}`;
}

export function unsubscribeUrl(email: string, organizationId: string, eventId?: string | null, campaignId?: string | null): string {
  return `${env().NEXT_PUBLIC_APP_URL}/desinscription/${unsubscribeToken(email, organizationId, eventId, campaignId)}`;
}

/** Adresse de l'en-tête List-Unsubscribe (RFC 8058) : désinscription en un clic par POST depuis la messagerie. */
export function oneClickUnsubscribeUrl(email: string, organizationId: string, eventId?: string | null, campaignId?: string | null): string {
  return `${env().NEXT_PUBLIC_APP_URL}/api/unsubscribe/${unsubscribeToken(email, organizationId, eventId, campaignId)}`;
}

export function readUnsubscribeToken(token: string): { email: string; organizationId: string; eventId: string | null; campaignId: string | null } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; o: string; v?: string; c?: string };
    return { email: d.e, organizationId: d.o, eventId: d.v ?? null, campaignId: d.c ?? null };
  } catch {
    return null;
  }
}

/** Désinscription d'un événement ou de toute l'organisation ; la seconde retire aussi le consentement marketing. */
export async function applyUnsubscribe(token: string, scope: "EVENT" | "ORGANIZATION", now = new Date()) {
  const t = readUnsubscribeToken(token);
  if (!t) throw new CoreError("UNSUBSCRIBE_INVALID");
  if (scope === "EVENT" && !t.eventId) throw new CoreError("UNSUBSCRIBE_INVALID");
  const where = { email: t.email, scope, organizationId: t.organizationId, eventId: scope === "EVENT" ? t.eventId : null };
  const existed = await db.emailSuppression.findFirst({ where, select: { id: true } });
  if (!existed) {
    await db.emailSuppression.create({ data: { ...where, reason: "UNSUBSCRIBED" } });
    // statistiques de la campagne d'origine : une désinscription comptée une seule fois
    if (t.campaignId)
      await db.emailCampaign.updateMany({ where: { id: t.campaignId, organizationId: t.organizationId }, data: { unsubscribeCount: { increment: 1 } } });
  }
  if (scope === "ORGANIZATION")
    await db.contact.updateMany({ where: { organizationId: t.organizationId, email: t.email }, data: { unsubscribedAt: now, marketingConsent: false } });
  await audit({
    action: `contact.unsubscribed_${scope.toLowerCase()}`,
    organizationId: t.organizationId,
    actorType: "SYSTEM",
    targetType: "Contact",
    targetId: t.email.length.toString(),
  });
  return t;
}

/**
 * RG-MKT-01 : transactionnel toujours envoyé ; service bloqué par la désinscription de l'événement ou une adresse bloquée
 * (rebond définitif, plainte, RG-MKT-03) ; marketing seulement avec consentement et sans aucune désinscription.
 */
export async function mayReceive(
  email: string,
  category: "TRANSACTIONAL" | "SERVICE" | "MARKETING",
  organizationId: string,
  eventId?: string | null,
): Promise<boolean> {
  if (category === "TRANSACTIONAL") return true;
  const e = email.toLowerCase();
  const blocked = await db.emailSuppression.findFirst({
    where: {
      email: e,
      OR: [
        { scope: "GLOBAL" },
        { scope: "ORGANIZATION", organizationId, ...(category === "SERVICE" ? { reason: { in: ["HARD_BOUNCE", "COMPLAINT", "MANUAL"] } } : {}) },
        ...(eventId ? [{ scope: "EVENT" as const, organizationId, eventId }] : []),
      ],
    },
    select: { id: true },
  });
  if (blocked) return false;
  if (category === "SERVICE") return true;
  const contact = await db.contact.findUnique({
    where: { organizationId_email: { organizationId, email: e } },
    select: { marketingConsent: true, unsubscribedAt: true },
  });
  return !!contact?.marketingConsent && !contact.unsubscribedAt;
}
