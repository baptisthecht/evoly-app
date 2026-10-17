import { CoreError, humanCode } from "@evoly/core";
import { Prisma } from "@evoly/db";
import { formatMoney, type Locale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "./email/send";
import type { OrgContext } from "./context";

/** Lien partenaire du lieu (US-LIEU-01) : l'organisateur qui s'inscrit par ce lien voit le lieu préproposé pour ses événements. */
export const venueLink = (code: string) => `${env().NEXT_PUBLIC_APP_URL}/register?lieu=${code}`;

/** Lien du lieu mémorisé 30 jours à l'arrivée sur l'app (proxy), lu à la création de l'organisation. */
export const VENUE_COOKIE = "evoly_lieu";

/**
 * RG-LIEU-02 : l'organisateur qui s'inscrit par le lien d'un lieu lui est rattaché une fois pour toutes, à cette date ;
 * un code inconnu est ignoré, un rattachement existant n'est jamais remplacé, un lieu ne se rattache pas à lui-même.
 */
export async function attachVenueReferral(organizationId: string, code: string | null | undefined, now = new Date()) {
  const clean = (code ?? "").trim().toUpperCase().slice(0, 20);
  if (!clean) return null;
  const venue = await db.venuePartner.findFirst({ where: { code: clean, active: true }, select: { id: true, organizationId: true } });
  if (!venue || venue.organizationId === organizationId) return null;
  const done = await db.organization.updateMany({
    where: { id: organizationId, referredByVenueId: null },
    data: { referredByVenueId: venue.id, referredByVenueAt: now },
  });
  return done.count === 1 ? venue.id : null;
}

/** RG-LIEU-01 : le lieu active le programme ; il reçoit un code et un lien uniques. */
export async function activateVenueProgram(ctx: OrgContext) {
  const existing = await db.venuePartner.findUnique({ where: { organizationId: ctx.organization.id } });
  if (existing) return existing.active ? existing : db.venuePartner.update({ where: { id: existing.id }, data: { active: true } });
  for (let i = 0; i < 5; i++) {
    try {
      return await db.venuePartner.create({ data: { organizationId: ctx.organization.id, code: humanCode(8).toUpperCase() } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  throw new CoreError("VENUE_CODE_FAILED");
}

/** RG-LIEU-06 : seuil de versement réglé par le lieu (activable, montant au choix, 1 € à 10 000 €). */
export async function setVenueThreshold(ctx: OrgContext, input: { enabled: boolean; amount: string }) {
  const venue = await db.venuePartner.findUnique({ where: { organizationId: ctx.organization.id } });
  if (!venue) throw new CoreError("NOT_FOUND");
  const euros = Number(input.amount.replace(",", ".").trim());
  if (input.enabled && (!Number.isFinite(euros) || euros < 1 || euros > 10_000)) throw new CoreError("VENUE_THRESHOLD_INVALID");
  return db.venuePartner.update({
    where: { id: venue.id },
    data: { thresholdEnabled: input.enabled, ...(input.enabled ? { thresholdMinor: Math.round(euros * 100) } : {}) },
  });
}

/** Section 9.32 : la salle du lieu, proposée d'office aux organisateurs qu'il a parrainés ; seuls les événements qui y ont lieu comptent. */
export async function setVenueHall(ctx: OrgContext, input: { hallName: string; addressLine1: string; postalCode: string; city: string; country: string }) {
  const venue = await db.venuePartner.findUnique({ where: { organizationId: ctx.organization.id } });
  if (!venue) throw new CoreError("NOT_FOUND");
  const clean = (v: string, max: number) => v.trim().slice(0, max) || null;
  if (!clean(input.addressLine1, 160)) throw new CoreError("VENUE_HALL_INVALID");
  return db.venuePartner.update({
    where: { id: venue.id },
    data: {
      hallName: clean(input.hallName, 120),
      addressLine1: clean(input.addressLine1, 160),
      postalCode: clean(input.postalCode, 16),
      city: clean(input.city, 80),
      country: (clean(input.country, 2) ?? ctx.organization.country).toUpperCase(),
    },
  });
}

/** Part nette d'une commande (RG-LIEU-04) : les remboursements et annulations en sont déduits au prorata. */
export function netVenueShare(o: { totalMinor: number; refundedMinor: number; venueShareMinor: number }) {
  if (o.totalMinor <= 0 || o.venueShareMinor <= 0) return 0;
  return Math.floor((o.venueShareMinor * Math.max(0, o.totalMinor - o.refundedMinor)) / o.totalMinor);
}

const COUNTED = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

/** Solde du lieu : parts nettes gagnées, moins les versements effectués. */
export async function venueBalance(venuePartnerId: string) {
  const orders = await db.order.findMany({
    where: { venuePartnerId, status: { in: [...COUNTED] } },
    select: { totalMinor: true, refundedMinor: true, venueShareMinor: true },
  });
  const earned = orders.reduce((n, o) => n + netVenueShare(o), 0);
  const paid = (await db.venuePayout.aggregate({ where: { venuePartnerId, status: "PAID" }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0;
  return earned - paid;
}

/**
 * RG-LIEU-05 : ce que voit le lieu : des totaux seulement (billets et part, par mois), jamais les acheteurs ni le détail
 * des ventes d'un organisateur.
 */
export async function venueSummary(ctx: OrgContext) {
  const venue = await db.venuePartner.findUnique({ where: { organizationId: ctx.organization.id } });
  if (!venue) return null;
  const orders = await db.order.findMany({
    where: { venuePartnerId: venue.id, status: { in: [...COUNTED] } },
    select: {
      paidAt: true,
      totalMinor: true,
      refundedMinor: true,
      venueShareMinor: true,
      _count: { select: { tickets: { where: { status: { in: ["VALID", "CHECKED_IN"] } } } } },
    },
  });
  const months = new Map<string, { month: string; tickets: number; shareMinor: number }>();
  for (const o of orders) {
    const month = (o.paidAt ?? new Date()).toISOString().slice(0, 7);
    const m = months.get(month) ?? { month, tickets: 0, shareMinor: 0 };
    m.tickets += o._count.tickets;
    m.shareMinor += netVenueShare(o);
    months.set(month, m);
  }
  return {
    code: venue.code,
    link: venueLink(venue.code),
    active: venue.active,
    thresholdEnabled: venue.thresholdEnabled,
    thresholdMinor: venue.thresholdMinor,
    hall: { name: venue.hallName ?? "", addressLine1: venue.addressLine1 ?? "", postalCode: venue.postalCode ?? "", city: venue.city ?? "" },
    balanceMinor: await venueBalance(venue.id),
    events: await db.event.count({ where: { venuePartnerId: venue.id } }),
    organizers: await db.organization.count({ where: { referredByVenueId: venue.id } }),
    months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    payouts: await db.venuePayout.findMany({
      where: { venuePartnerId: venue.id },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, amountMinor: true, currency: true, manual: true, status: true, createdAt: true },
    }),
  };
}

type Transfer = (p: { amount: number; currency: string; destination: string; idempotencyKey: string }) => Promise<{ id: string }>;
const stripeTransfer: Transfer = async (p) => {
  const s = stripe();
  if (!s) throw new Error("Stripe indisponible");
  return s.transfers.create({ amount: p.amount, currency: p.currency, destination: p.destination }, { idempotencyKey: p.idempotencyKey });
};

/**
 * RG-LIEU-06 : versement du solde sur le compte Stripe du lieu. Chaque mois : sous le seuil (s'il est activé), la part est
 * reportée. À la demande (« Verser maintenant ») : dès 1 €, une fois par jour au plus.
 */
export async function payVenue(venuePartnerId: string, opts: { manual: boolean; now?: Date; transfer?: Transfer }) {
  const now = opts.now ?? new Date();
  const venue = await db.venuePartner.findUniqueOrThrow({ where: { id: venuePartnerId }, include: { organization: { select: { currency: true } } } });
  const balance = await venueBalance(venue.id);
  if (opts.manual) {
    if (balance < 100) throw new CoreError("VENUE_BALANCE_TOO_LOW");
    const recent = await db.venuePayout.count({
      where: { venuePartnerId: venue.id, manual: true, status: "PAID", createdAt: { gt: new Date(now.getTime() - 86_400_000) } },
    });
    if (recent > 0) throw new CoreError("VENUE_PAYOUT_TOO_SOON");
  } else if (balance <= 0 || (venue.thresholdEnabled && balance < venue.thresholdMinor)) {
    return { status: "CARRIED_OVER" as const, balanceMinor: balance };
  }
  const account = await db.stripeAccount.findUnique({ where: { organizationId: venue.organizationId }, select: { stripeAccountId: true } });
  if (!account) {
    if (opts.manual) throw new CoreError("VENUE_NO_STRIPE");
    return { status: "NO_STRIPE" as const, balanceMinor: balance };
  }
  const currency = venue.organization.currency.toLowerCase();
  try {
    const t = await (opts.transfer ?? stripeTransfer)({
      amount: balance,
      currency,
      destination: account.stripeAccountId,
      idempotencyKey: `venue-${venue.id}-${now.toISOString().slice(0, 10)}-${balance}`,
    });
    await db.venuePayout.create({
      data: {
        venuePartnerId: venue.id,
        amountMinor: balance,
        currency: venue.organization.currency,
        manual: opts.manual,
        status: "PAID",
        stripeTransferId: t.id,
        createdAt: now,
      },
    });
    await mailVenuePayout(venue.organizationId, balance, venue.organization.currency).catch(() => undefined); // le relevé ne bloque jamais le versement
    return { status: "PAID" as const, balanceMinor: balance };
  } catch (err) {
    await db.venuePayout.create({
      data: {
        venuePartnerId: venue.id,
        amountMinor: balance,
        currency: venue.organization.currency,
        manual: opts.manual,
        status: "FAILED",
        error: String(err).slice(0, 500),
        createdAt: now,
      },
    });
    if (opts.manual) throw new CoreError("VENUE_PAYOUT_FAILED");
    return { status: "FAILED" as const, balanceMinor: balance };
  }
}

/** « Verser maintenant », par le lieu lui-même. */
export async function payVenueNow(ctx: OrgContext, transfer?: Transfer) {
  const venue = await db.venuePartner.findUnique({ where: { organizationId: ctx.organization.id } });
  if (!venue) throw new CoreError("NOT_FOUND");
  return payVenue(venue.id, { manual: true, transfer });
}

/** Le 1er de chaque mois : versement à chaque lieu actif, selon son seuil. */
export async function monthlyVenuePayouts(now = new Date(), transfer?: Transfer) {
  const venues = await db.venuePartner.findMany({ where: { active: true }, select: { id: true } });
  const results: Array<{ id: string; status: string; balanceMinor: number }> = [];
  for (const v of venues) results.push({ id: v.id, ...(await payVenue(v.id, { manual: false, now, transfer })) });
  return { venues: venues.length, paid: results.filter((r) => r.status === "PAID").length, results };
}

/** RG-LIEU-06 : relevé envoyé au propriétaire du lieu à chaque versement réussi. */
async function mailVenuePayout(organizationId: string, amountMinor: number, currency: string) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: { members: { where: { role: { systemKey: "OWNER" } }, include: { user: { select: { email: true, name: true } } }, take: 1 } },
  });
  const owner = org.members[0]?.user;
  if (!owner) return;
  const fr = org.locale !== "en";
  const amount = formatMoney(amountMinor, currency, (fr ? "fr" : "en") as Locale);
  await sendEmail({
    to: owner.email,
    template: "venue.payout",
    category: "SERVICE",
    organizationId,
    subject: fr ? `Lieu partenaire : ${amount} versés sur votre compte` : `Partner venue: ${amount} paid to your account`,
    text: fr
      ? `Bonjour ${owner.name},\n\nNous venons de verser ${amount} sur votre compte Stripe : votre part de la commission d'Evoly sur les événements organisés dans votre salle. Le détail par mois est sur la page Abonnement.\n\nEvoly`
      : `Hi ${owner.name},\n\nWe have just paid ${amount} to your Stripe account: your share of Evoly's commission on the events held at your venue. The monthly breakdown is on the Billing page.\n\nEvoly`,
    html: fr
      ? `<p>Bonjour ${owner.name},</p><p>Nous venons de verser <strong>${amount}</strong> sur votre compte Stripe : votre part de la commission d'Evoly sur les événements organisés dans votre salle.</p><p>Le détail par mois est sur la page Abonnement.</p><p>Evoly</p>`
      : `<p>Hi ${owner.name},</p><p>We have just paid <strong>${amount}</strong> to your Stripe account: your share of Evoly's commission on the events held at your venue.</p><p>The monthly breakdown is on the Billing page.</p><p>Evoly</p>`,
  });
}

/** US-LIEU-03 : le lieu partenaire auquel l'organisation est rattachée, pour l'en informer. */
export async function referringVenueName(organizationId: string) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { referredByVenue: { select: { active: true, hallName: true, organization: { select: { name: true } } } } },
  });
  const v = org?.referredByVenue;
  return v?.active ? v.hallName || v.organization.name : null;
}
