import { CoreError, humanCode } from "@evoly/core";
import { Prisma } from "@evoly/db";
import { formatDate, formatMoney, type Locale } from "@evoly/i18n";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  // RG-LIEU-07 (décidé au mieux) : lieux situés en Belgique ; ailleurs, Evoly devrait autoliquider la TVA belge sur leur part
  if (ctx.organization.country !== "BE") throw new CoreError("VENUE_COUNTRY_UNSUPPORTED");
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
    selfBillingAcceptedAt: venue.selfBillingAcceptedAt,
    balanceMinor: await venueBalance(venue.id),
    events: await db.event.count({ where: { venuePartnerId: venue.id } }),
    organizers: await db.organization.count({ where: { referredByVenueId: venue.id } }),
    months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    payouts: await db.venuePayout.findMany({
      where: { venuePartnerId: venue.id },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, amountMinor: true, currency: true, manual: true, status: true, createdAt: true, invoiceNumber: true },
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
  // RG-LIEU-07 : rien n'est versé sans l'accord d'autofacturation et les informations de facturation du lieu
  const supplier = await db.organization.findUniqueOrThrow({
    where: { id: venue.organizationId },
    select: { addressLine1: true, vatRegistered: true, vatNumber: true },
  });
  if (!venue.selfBillingAcceptedAt || !supplier.addressLine1 || (supplier.vatRegistered && !supplier.vatNumber)) {
    if (opts.manual) throw new CoreError("VENUE_BILLING_INFO");
    return { status: "INFO_MISSING" as const, balanceMinor: balance };
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
    // RG-LIEU-07 : facture d'autofacturation, numérotée pour ce lieu, TVA comprise dans le montant versé
    const vat = venueShareVat(balance, supplier);
    const payout = await db.$transaction(async (tx) => {
      const { invoiceSeq } = await tx.venuePartner.update({ where: { id: venue.id }, data: { invoiceSeq: { increment: 1 } }, select: { invoiceSeq: true } });
      return tx.venuePayout.create({
        data: {
          venuePartnerId: venue.id,
          amountMinor: balance,
          currency: venue.organization.currency,
          manual: opts.manual,
          status: "PAID",
          stripeTransferId: t.id,
          createdAt: now,
          invoiceNumber: `AF-${venue.code}-${String(invoiceSeq).padStart(4, "0")}`,
          netMinor: vat.netMinor,
          vatMinor: vat.vatMinor,
          vatRateBps: vat.vatRateBps,
          vatMention: vat.mention,
        },
      });
    });
    await mailVenuePayout(payout.id).catch(() => undefined); // le relevé ne bloque jamais le versement
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

/** RG-LIEU-06 et 07 : relevé envoyé au propriétaire du lieu à chaque versement réussi, avec la facture d'autofacturation. */
async function mailVenuePayout(payoutId: string) {
  const payout = await db.venuePayout.findUniqueOrThrow({ where: { id: payoutId }, include: { venuePartner: { select: { organizationId: true } } } });
  const org = await db.organization.findUniqueOrThrow({
    where: { id: payout.venuePartner.organizationId },
    include: { members: { where: { role: { systemKey: "OWNER" } }, include: { user: { select: { email: true, name: true } } }, take: 1 } },
  });
  const owner = org.members[0]?.user;
  if (!owner) return;
  const fr = org.locale !== "en";
  const amount = formatMoney(payout.amountMinor, payout.currency, (fr ? "fr" : "en") as Locale);
  const invoice = await selfBillingPdf(payout.id);
  await sendEmail({
    to: owner.email,
    template: "venue.payout",
    category: "SERVICE",
    organizationId: org.id,
    subject: fr ? `Lieu partenaire : ${amount} versés sur votre compte` : `Partner venue: ${amount} paid to your account`,
    text: fr
      ? `Bonjour ${owner.name},\n\nNous venons de verser ${amount} sur votre compte Stripe : votre part de la commission d'Evoly sur les événements organisés dans votre salle. La facture d'autofacturation est jointe ; le détail par mois est sur la page Abonnement.\n\nEvoly`
      : `Hi ${owner.name},\n\nWe have just paid ${amount} to your Stripe account: your share of Evoly's commission on the events held at your venue. The self-billed invoice is attached; the monthly breakdown is on the Billing page.\n\nEvoly`,
    html: fr
      ? `<p>Bonjour ${owner.name},</p><p>Nous venons de verser <strong>${amount}</strong> sur votre compte Stripe : votre part de la commission d'Evoly sur les événements organisés dans votre salle.</p><p>La facture d'autofacturation est jointe ; le détail par mois est sur la page Abonnement.</p><p>Evoly</p>`
      : `<p>Hi ${owner.name},</p><p>We have just paid <strong>${amount}</strong> to your Stripe account: your share of Evoly's commission on the events held at your venue.</p><p>The self-billed invoice is attached; the monthly breakdown is on the Billing page.</p><p>Evoly</p>`,
    ...(invoice ? { attachments: [{ filename: `${invoice.number}.pdf`, content: Buffer.from(invoice.bytes), contentType: "application/pdf" }] } : {}),
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

/** RG-LIEU-07 : accord préalable du lieu à l'autofacturation ; la première date est gardée. */
export async function acceptSelfBilling(ctx: OrgContext, now = new Date()) {
  const venue = await db.venuePartner.findUnique({ where: { organizationId: ctx.organization.id } });
  if (!venue) throw new CoreError("NOT_FOUND");
  return db.venuePartner.update({ where: { id: venue.id }, data: { selfBillingAcceptedAt: venue.selfBillingAcceptedAt ?? now } });
}

/**
 * RG-LIEU-07 (décidé au mieux, sans expert-comptable) : la part versée est TVA comprise. Lieu assujetti en Belgique : 21 %
 * de TVA belge à l'intérieur du montant, due par le lieu ; sinon aucune. Evoly, sous la franchise, ne paie jamais plus que la part.
 */
export function venueShareVat(amountMinor: number, supplier: { vatRegistered: boolean; vatNumber: string | null }) {
  if (supplier.vatRegistered && supplier.vatNumber) {
    const net = Math.round((amountMinor * 10_000) / 12_100);
    return { netMinor: net, vatMinor: amountMinor - net, vatRateBps: 2100, mention: "BE_VAT" as const };
  }
  return { netMinor: amountMinor, vatMinor: 0, vatRateBps: 0, mention: supplier.vatNumber ? ("FRANCHISE" as const) : ("NOT_REGISTERED" as const) };
}

const PDF_TEXT = {
  fr: {
    title: "Facture",
    selfBilling: "Autofacturation",
    supplier: "Fournisseur",
    customer: "Client",
    date: "Date",
    line: "Part de lieu partenaire : apport d'affaires (événements organisés dans votre salle, programme Lieu partenaire d'Evoly)",
    net: "Montant hors TVA",
    vat: "TVA 21 %",
    total: "Total",
    vatNo: "TVA",
    noVat: "Non assujetti à la TVA",
    franchise: "Régime particulier de franchise des petites entreprises",
    BE_VAT: "TVA belge 21 % comprise, due par le fournisseur.",
    FRANCHISE: "Régime particulier de franchise des petites entreprises : TVA non applicable.",
    NOT_REGISTERED: "Fournisseur non assujetti à la TVA : TVA non applicable.",
    terms: (date: string) =>
      `Facture établie par le client, Evoly, au nom et pour le compte du fournisseur (autofacturation), selon l'accord du ${date}. Elle est réputée acceptée sauf contestation dans les 15 jours.`,
    paid: (date: string) => `Montant versé sur le compte Stripe du fournisseur le ${date}.`,
  },
  en: {
    title: "Invoice",
    selfBilling: "Self-billing",
    supplier: "Supplier",
    customer: "Customer",
    date: "Date",
    line: "Partner venue share: business referral (events held at your venue, Evoly Partner venue programme)",
    net: "Amount excluding VAT",
    vat: "VAT 21%",
    total: "Total",
    vatNo: "VAT",
    noVat: "Not registered for VAT",
    franchise: "Special small business VAT exemption scheme",
    BE_VAT: "Belgian VAT 21% included, due by the supplier.",
    FRANCHISE: "Special small business exemption scheme: VAT not applicable.",
    NOT_REGISTERED: "Supplier not registered for VAT: VAT not applicable.",
    terms: (date: string) =>
      `Invoice issued by the customer, Evoly, in the name and on behalf of the supplier (self-billing), under the agreement of ${date}. It is deemed accepted unless disputed within 15 days.`,
    paid: (date: string) => `Amount paid to the supplier's Stripe account on ${date}.`,
  },
};
const ink = rgb(0x22 / 255, 0x22 / 255, 0x22 / 255);
const grey = rgb(0.4, 0.4, 0.4);
/** Polices standard du PDF : seulement les caractères qu'elles savent afficher. */
const winAnsi = (v: string) =>
  v
    .replace(/[\u202f\u00a0]/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\xff€]/g, "");

/** RG-LIEU-07 : la facture d'autofacturation d'un versement réussi. */
export async function selfBillingPdf(payoutId: string): Promise<{ bytes: Uint8Array; number: string } | null> {
  const p = await db.venuePayout.findUnique({
    where: { id: payoutId },
    include: {
      venuePartner: {
        select: {
          selfBillingAcceptedAt: true,
          organization: {
            select: {
              name: true,
              legalName: true,
              addressLine1: true,
              addressLine2: true,
              postalCode: true,
              city: true,
              country: true,
              vatNumber: true,
              locale: true,
              timezone: true,
            },
          },
        },
      },
    },
  });
  if (!p || p.status !== "PAID" || !p.invoiceNumber) return null;
  const o = p.venuePartner.organization;
  const locale = (o.locale === "en" ? "en" : "fr") as Locale;
  const L = PDF_TEXT[locale === "en" ? "en" : "fr"];
  const money = (v: number) => winAnsi(formatMoney(v, p.currency, locale));
  const day = (d: Date) => formatDate(d, o.timezone, locale);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = (v: string, x: number, y: number, size = 10, font = regular, color = ink) => page.drawText(winAnsi(v), { x, y, size, font, color });
  const wrap = (v: string, x: number, y: number, width: number, size = 9) => {
    let line = "";
    let yy = y;
    for (const w of winAnsi(v).split(" ")) {
      const next = line ? `${line} ${w}` : w;
      if (regular.widthOfTextAtSize(next, size) > width) {
        text(line, x, yy, size, regular, grey);
        yy -= size + 4;
        line = w;
      } else line = next;
    }
    if (line) text(line, x, yy, size, regular, grey);
    return yy - size - 4;
  };
  text(`${L.title} ${p.invoiceNumber}`, 48, 780, 16, bold);
  text(L.selfBilling, 48, 762, 11, bold, grey);
  text(`${L.date} : ${day(p.createdAt)}`, 380, 780, 10);
  text(L.supplier, 48, 720, 10, bold);
  const supplier = [
    o.legalName || o.name,
    o.addressLine1,
    o.addressLine2,
    [o.postalCode, o.city].filter(Boolean).join(" "),
    o.country,
    o.vatNumber ? `${L.vatNo} ${o.vatNumber}` : L.noVat,
  ];
  supplier.filter(Boolean).forEach((v, k) => text(String(v), 48, 704 - k * 14, 10));
  text(L.customer, 320, 720, 10, bold);
  const customer = [env().EVOLY_LEGAL_NAME, env().EVOLY_LEGAL_ADDRESS, env().EVOLY_VAT_NUMBER ? `${L.vatNo} ${env().EVOLY_VAT_NUMBER}` : L.franchise];
  customer.forEach((v, k) => wrap(String(v), 320, 704 - k * 14, 230, 10));
  let y = wrap(L.line, 48, 590, 330, 10);
  text(money(p.netMinor ?? p.amountMinor), 470, 590, 10);
  y -= 10;
  page.drawLine({ start: { x: 48, y: y + 6 }, end: { x: 547, y: y + 6 }, color: grey, thickness: 0.5 });
  text(L.net, 320, y - 10, 10);
  text(money(p.netMinor ?? p.amountMinor), 470, y - 10, 10);
  if ((p.vatMinor ?? 0) > 0) {
    text(L.vat, 320, y - 26, 10);
    text(money(p.vatMinor ?? 0), 470, y - 26, 10);
  }
  text(L.total, 320, y - 44, 11, bold);
  text(money(p.amountMinor), 470, y - 44, 11, bold);
  y = wrap(L[(p.vatMention as "BE_VAT" | "FRANCHISE" | "NOT_REGISTERED") ?? "NOT_REGISTERED"] ?? "", 48, y - 80, 499);
  y = wrap(L.terms(day(p.venuePartner.selfBillingAcceptedAt ?? p.createdAt)), 48, y - 4, 499);
  wrap(L.paid(day(p.createdAt)), 48, y - 4, 499);
  return { bytes: await pdf.save(), number: p.invoiceNumber };
}
