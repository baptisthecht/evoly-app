import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import { sendEmail } from "./email/send";
import { ticketsUrl } from "./orders";
import { hit } from "./rateLimit";
import { applyUnsubscribe, unsubscribeToken } from "./unsubscribe";

/**
 * Section 9.23 : espace participant, sans compte ni mot de passe. Lien de connexion par e-mail (30 minutes),
 * puis session de 30 jours sur l'appareil (cookie signé). Les commandes passées avec la même adresse sont rattachées d'office.
 */
const COOKIE = "evoly_participant";
const secret = () => env().ORDER_TOKEN_SECRET ?? env().BETTER_AUTH_SECRET;
const sign = (purpose: string, v: string) => createHmac("sha256", `${purpose}:${secret()}`).update(v).digest("base64url");
const pack = (purpose: string, email: string, exp: number) => {
  const body = Buffer.from(`${email}|${exp}`).toString("base64url");
  return `${body}.${sign(purpose, body)}`;
};
function unpack(purpose: string, token: string | undefined | null): string | null {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig) return null;
  const expected = sign(purpose, body);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [email, exp] = Buffer.from(body, "base64url").toString().split("|");
  return email && Number(exp) > Date.now() ? email : null;
}

/** Demande de lien : même réponse que l'adresse ait des billets ou non (aucune fuite), tentatives limitées. */
export async function requestParticipantLink(rawEmail: string, ip: string, locale: "fr" | "en") {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return;
  if ((await hit(`participant:ip:${ip}`, 3600)) > 20 || (await hit(`participant:email:${email}`, 3600)) > 5) return;
  const known = await db.order.count({ where: { buyerEmail: email, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } } });
  if (known === 0) return;
  const url = `${env().NEXT_PUBLIC_APP_URL}/mon-espace/connexion/${pack("participant-link", email, Date.now() + 30 * 60_000)}`;
  const fr = locale !== "en";
  await sendEmail({
    to: email,
    template: "participant.magic_link",
    category: "TRANSACTIONAL",
    subject: fr ? "Votre lien vers vos billets Evoly" : "Your link to your Evoly tickets",
    text: fr
      ? `Bonjour,\n\nVoici votre lien pour retrouver tous vos billets (valable 30 minutes) :\n${url}\n\nVous n'avez rien demandé ? Ignorez cet e-mail.\n\nEvoly`
      : `Hello,\n\nHere is your link to all your tickets (valid for 30 minutes):\n${url}\n\nDidn't ask for it? Ignore this email.\n\nEvoly`,
    html: fr
      ? `<p>Bonjour,</p><p>Voici votre lien pour retrouver tous vos billets (valable 30 minutes) :</p><p><a href="${url}">Ouvrir mon espace</a></p><p>Vous n'avez rien demandé ? Ignorez cet e-mail.</p><p>Evoly</p>`
      : `<p>Hello,</p><p>Here is your link to all your tickets (valid for 30 minutes):</p><p><a href="${url}">Open my space</a></p><p>Didn't ask for it? Ignore this email.</p><p>Evoly</p>`,
  });
}

export async function openParticipantSession(linkToken: string): Promise<boolean> {
  const email = unpack("participant-link", linkToken);
  if (!email) return false;
  (await cookies()).set(COOKIE, pack("participant-session", email, Date.now() + 30 * 86_400_000), {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NEXT_PUBLIC_APP_URL.startsWith("https"),
    path: "/",
    maxAge: 30 * 86_400,
  });
  return true;
}

export async function participantEmail(): Promise<string | null> {
  return unpack("participant-session", (await cookies()).get(COOKIE)?.value);
}

export async function closeParticipantSession() {
  (await cookies()).delete(COOKIE);
}

/** Billets à venir et passés, reventes et préférences d'e-mails, toutes organisations confondues. */
export async function participantOverview(email: string, now = new Date()) {
  const [orders, listings, contacts] = await Promise.all([
    db.order.findMany({
      where: { buyerEmail: email, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      include: {
        event: { select: { title: true, startsAt: true, timezone: true, locationName: true, city: true, status: true } },
        organization: { select: { name: true, subdomain: true, slug: true } },
        _count: { select: { tickets: { where: { status: { in: ["VALID", "CHECKED_IN"] } } } } },
      },
      orderBy: { event: { startsAt: "asc" } },
    }),
    db.resaleListing.findMany({
      where: { sellerEmail: email },
      include: { event: { select: { title: true, startsAt: true, timezone: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.contact.findMany({ where: { email }, include: { organization: { select: { id: true, name: true, status: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const rows = orders.map((o) => ({
    id: o.id,
    reference: o.reference,
    title: o.event.title,
    startsAt: o.event.startsAt,
    timezone: o.event.timezone,
    place: [o.event.locationName, o.event.city].filter(Boolean).join(", "),
    organization: o.organization.name,
    cancelled: o.event.status === "CANCELLED",
    refunded: o.status === "REFUNDED",
    tickets: o._count.tickets,
    url: ticketsUrl(o.organization, o.id, o.accessTokenVersion),
  }));
  return {
    upcoming: rows.filter((r) => r.startsAt >= new Date(now.getTime() - 12 * 3_600_000)),
    past: rows.filter((r) => r.startsAt < new Date(now.getTime() - 12 * 3_600_000)).reverse(),
    listings: listings.map((l) => ({
      id: l.id,
      title: l.event.title,
      startsAt: l.event.startsAt,
      timezone: l.event.timezone,
      status: l.status,
      priceMinor: l.priceMinor,
      currency: l.currency,
    })),
    preferences: contacts
      .filter((c) => c.organization.status !== "DELETED")
      .map((c) => ({ organizationId: c.organization.id, organization: c.organization.name, marketing: c.marketingConsent && !c.unsubscribedAt })),
  };
}

/** Préférences : désinscription (lien signé habituel) ou nouvel accord explicite, journalisé. */
export async function setMarketingPreference(email: string, organizationId: string, consent: boolean) {
  const contact = await db.contact.findFirst({ where: { email, organizationId } });
  if (!contact) return;
  if (!consent) {
    await applyUnsubscribe(unsubscribeToken(email, organizationId), "ORGANIZATION");
    return;
  }
  await db.$transaction([
    db.contact.update({ where: { id: contact.id }, data: { marketingConsent: true, consentAt: new Date(), consentSource: "FORM", unsubscribedAt: null } }),
    // seule la désinscription volontaire est levée : les blocages pour rebond ou plainte restent
    db.emailSuppression.deleteMany({ where: { email, organizationId, scope: "ORGANIZATION", reason: "UNSUBSCRIBED" } }),
  ]);
  await audit({
    action: "contact.consent_given",
    organizationId,
    actorType: "SYSTEM",
    targetType: "Contact",
    targetId: contact.id,
    metadata: { source: "PARTICIPANT_SPACE" },
  });
}
