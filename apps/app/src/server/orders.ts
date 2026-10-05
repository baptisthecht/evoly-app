import "server-only";
import { renderEventBlock } from "./email/eventBlock";
import { createHash } from "node:crypto";
import { notifyNewOrder, notifySalesMilestone } from "./notifications";
import { qualifyReferral } from "./referrals";
import { effectiveEnd } from "@evoly/core";
import { pick, toLocale } from "@evoly/i18n";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { finalizeOrder, orderAccessToken, refundUnfulfilledPayment, type FinalizeOutcome } from "./checkout";
import { sendEmail } from "./email/send";
import { orderConfirmationEmail, ticketsLookupEmail } from "./email/templates";
import { eventIcs } from "./calendar";
import { settleResale } from "./resale";
import { buildTicketsPdf } from "./ticketsPdf";
import { emailBrandFor, logoBytes } from "./email/brand";
import { organizationPublicUrl } from "./urls";

export function ticketsUrl(org: { subdomain: string | null; slug: string }, orderId: string, version: number): string {
  return `${organizationPublicUrl(org.subdomain ?? org.slug)}/billets/${orderAccessToken(orderId, version)}`;
}

/** E-mail de confirmation avec le lien magique vers les billets (section 9.12). */
export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      event: true,
      organization: { select: { name: true, subdomain: true, slug: true } },
      items: { include: { ticketType: { select: { name: true } } } },
      tickets: {
        include: { ticketType: { select: { name: true } }, seat: { select: { label: true, row: { select: { name: true } } } } },
        orderBy: [{ ticketTypeId: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  const locale = toLocale(order.buyerLocale); // e-mail dans la langue de l'acheteur (7 langues)
  const e = order.event;
  const where =
    e.locationType === "ONLINE" ? null : [e.locationName, e.addressLine1, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const brand = await emailBrandFor(order.organizationId);
  const email = orderConfirmationEmail({
    brand,
    custom: renderEventBlock(e.ticketEmailContent, { firstName: order.buyerFirstName, brand }),
    locale,
    organizationName: order.organization.name,
    eventTitle: e.title,
    when: formatDateTime(e.startsAt, e.timezone, locale),
    where,
    online: e.locationType !== "PHYSICAL" ? e.onlineUrl : null,
    lines: order.items.map((i) => ({ name: i.ticketType.name, quantity: i.quantity })),
    total: order.totalMinor === 0 ? null : formatMoney(order.totalMinor, order.currency, locale),
    reference: order.reference,
    url: ticketsUrl(order.organization, order.id, order.accessTokenVersion),
    firstName: order.buyerFirstName,
  });
  const pdf = await ticketsPdfFor(order, locale);
  const ics = eventIcs(e, `${e.id}-${order.id}`);
  await sendEmail({
    ...email,
    to: order.buyerEmail,
    template: "order.confirmation",
    category: "TRANSACTIONAL",
    organizationId: order.organizationId,
    orderId: order.id,
    fromName: brand.fromName,
    replyTo: brand.replyTo,
    attachments: [
      { filename: `billets-${order.reference}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" },
      { filename: `${e.slug}.ics`, content: Buffer.from(ics, "utf8"), contentType: "text/calendar; charset=utf-8" },
    ],
  });
}

const PDF_LABELS = {
  fr: {
    ticket: (i: number, n: number) => `Billet ${i} sur ${n}`,
    holder: "Titulaire",
    reference: "Commande",
    entrance: "Présentez ce billet à l’entrée, imprimé ou sur votre téléphone. Chaque QR code n’est accepté qu’une fois : ne le partagez pas.",
    poweredBy: "Billetterie Evoly",
  },
  en: {
    ticket: (i: number, n: number) => `Ticket ${i} of ${n}`,
    holder: "Holder",
    reference: "Order",
    entrance: "Show this ticket at the entrance, printed or on your phone. Each QR code is accepted only once: don’t share it.",
    poweredBy: "Evoly ticketing",
  },
  es: {
    ticket: (i: number, n: number) => `Entrada ${i} de ${n}`,
    holder: "Titular",
    reference: "Pedido",
    entrance: "Presenta esta entrada en el acceso, impresa o en tu móvil. Cada código QR solo se acepta una vez: no lo compartas.",
    poweredBy: "Venta de entradas Evoly",
  },
  de: {
    ticket: (i: number, n: number) => `Ticket ${i} von ${n}`,
    holder: "Inhaber",
    reference: "Bestellung",
    entrance: "Zeigen Sie dieses Ticket am Eingang vor, ausgedruckt oder auf dem Handy. Jeder QR-Code wird nur einmal akzeptiert: Geben Sie ihn nicht weiter.",
    poweredBy: "Ticketing von Evoly",
  },
  it: {
    ticket: (i: number, n: number) => `Biglietto ${i} di ${n}`,
    holder: "Titolare",
    reference: "Ordine",
    entrance: "Mostra questo biglietto all’ingresso, stampato o sul telefono. Ogni codice QR viene accettato una sola volta: non condividerlo.",
    poweredBy: "Biglietteria Evoly",
  },
  pt: {
    ticket: (i: number, n: number) => `Bilhete ${i} de ${n}`,
    holder: "Titular",
    reference: "Encomenda",
    entrance: "Apresente este bilhete à entrada, impresso ou no telemóvel. Cada código QR só é aceite uma vez: não o partilhe.",
    poweredBy: "Bilheteira Evoly",
  },
  nl: {
    ticket: (i: number, n: number) => `Ticket ${i} van ${n}`,
    holder: "Houder",
    reference: "Bestelling",
    entrance: "Toon dit ticket aan de ingang, afgedrukt of op je telefoon. Elke QR-code wordt maar één keer aanvaard: deel hem niet.",
    poweredBy: "Ticketverkoop door Evoly",
  },
} as const;

/** PDF des billets d'une commande payée (une page par billet). */
export async function ticketsPdfFor(
  order: {
    reference: string;
    organizationId?: string;
    organization: { name: string };
    event: {
      title: string;
      startsAt: Date;
      timezone: string;
      locationType: string;
      locationName: string | null;
      addressLine1: string | null;
      postalCode: string | null;
      city: string | null;
    };
    tickets: Array<{
      code: string;
      shortCode: string;
      holderFirstName: string | null;
      holderLastName: string | null;
      ticketType: { name: string };
      status?: string;
      voidReason?: string | null;
      seat?: { label: string; row: { name: string } } | null;
    }>;
  },
  locale: Locale,
): Promise<Uint8Array> {
  const e = order.event;
  const brand = order.organizationId ? await emailBrandFor(order.organizationId) : null;
  const input: Parameters<typeof buildTicketsPdf>[0] = {
    brand: brand
      ? { primary: brand.primary, primaryInk: brand.primaryInk, logo: await logoBytes(brand.logoUrl), showPoweredBy: brand.showPoweredBy }
      : undefined,
    organizationName: order.organization.name,
    eventTitle: e.title,
    when: formatDateTime(e.startsAt, e.timezone, locale),
    where: e.locationType === "ONLINE" ? null : [e.locationName, e.addressLine1, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    reference: order.reference,
    tickets: order.tickets.map((t) => ({
      code: t.code,
      shortCode: t.shortCode,
      typeName: t.seat
        ? `${t.ticketType.name} · ${locale === "en" ? "Row" : "Rang"} ${t.seat.row.name} · ${locale === "en" ? "Seat" : "Place"} ${t.seat.label}`
        : t.ticketType.name,
      holder: t.holderFirstName ? `${t.holderFirstName} ${t.holderLastName ?? ""}`.trim() : null,
      invalidLabel: t.status && !["VALID", "CHECKED_IN"].includes(t.status) ? invalidTicketLabel(t.voidReason ?? t.status, locale) : null,
    })),
    labels: pick(PDF_LABELS, locale),
  };
  // RG-FILE-02 : PDF gardé en mémoire, indexé par l'empreinte de tout ce qui le compose (marque, logo, événement,
  // billets, langue) : un billet revendu, un titulaire changé ou un événement déplacé donnent un nouveau PDF
  const logoHash = input.brand?.logo ? createHash("sha256").update(input.brand.logo.bytes).digest("hex") : null;
  const key = createHash("sha256")
    .update(JSON.stringify({ ...input, brand: input.brand ? { ...input.brand, logo: logoHash } : null, labels: locale }))
    .digest("hex");
  const hit = pdfCache.get(key);
  if (hit) {
    pdfCache.delete(key);
    pdfCache.set(key, hit); // le plus récemment utilisé passe en dernier
    pdfCacheStats.hits += 1;
    return hit;
  }
  const bytes = await buildTicketsPdf(input);
  pdfCacheStats.misses += 1;
  pdfCache.set(key, bytes);
  pdfCacheBytes += bytes.length;
  while (pdfCacheBytes > PDF_CACHE_MAX_BYTES && pdfCache.size > 1) {
    const [oldest, old] = pdfCache.entries().next().value!;
    pdfCache.delete(oldest);
    pdfCacheBytes -= old.length;
  }
  return bytes;
}

const PDF_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const pdfCache = new Map<string, Uint8Array>();
let pdfCacheBytes = 0;
/** Tests : réussites et échecs du cache des PDF. */
export const pdfCacheStats = { hits: 0, misses: 0 };

/**
 * Frais Stripe réels, net de l'organisateur et moyen de paiement réellement utilisé, relevés sur le paiement du compte
 * connecté (RG-BUY-07). La transaction peut être créée par Stripe un peu après le paiement : rien n'est enregistré
 * tant qu'elle manque, et le relevé est repris à l'événement charge.updated ou par le rattrapage planifié.
 * Renvoie true quand les frais sont enregistrés.
 */
export async function recordStripeFees(orderId: string, chargeId: string): Promise<boolean> {
  const s = stripe();
  const order = await db.order.findUnique({ where: { id: orderId }, select: { organizationId: true, currency: true } });
  const account = order ? await db.stripeAccount.findUnique({ where: { organizationId: order.organizationId }, select: { stripeAccountId: true } }) : null;
  if (!s || !order || !account) return false;
  const charge = await s.charges.retrieve(chargeId, { expand: ["balance_transaction"] }, { stripeAccount: account.stripeAccountId });
  const method = charge.payment_method_details?.type ?? null;
  if (method) await db.order.update({ where: { id: orderId }, data: { paymentMethodType: method } });
  const bt = charge.balance_transaction as Stripe.BalanceTransaction | string | null;
  if (!bt || typeof bt === "string") return false; // pas encore créée par Stripe : reprise plus tard
  if (bt.currency.toUpperCase() !== order.currency) return true; // devise de règlement différente : relevé dans les finances
  const stripeFee = bt.fee_details.filter((f) => f.type === "stripe_fee").reduce((n, f) => n + f.amount, 0);
  await db.order.update({ where: { id: orderId }, data: { paymentFeeMinor: stripeFee, netMinor: bt.net } });
  return true;
}

/** Événement charge.updated : frais enregistrés dès que Stripe a créé la transaction du paiement. */
export async function stripeFeesForCharge(chargeId: string): Promise<boolean> {
  const order = await db.order.findUnique({ where: { stripeChargeId: chargeId }, select: { id: true, paymentFeeMinor: true } });
  if (!order || order.paymentFeeMinor !== null) return false;
  return recordStripeFees(order.id, chargeId);
}

/**
 * Rattrapage planifié (chaque minute) : frais encore manquants des commandes payées des 3 derniers jours, les plus
 * récentes d'abord, 10 par passage. charge.updated règle presque tous les cas en quelques secondes ; une commande
 * réglée dans une autre devise (sans frais à enregistrer) n'est ainsi pas retentée indéfiniment.
 */
export async function fillMissingStripeFees(now = new Date()): Promise<number> {
  const orders = await db.order.findMany({
    where: {
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      stripeChargeId: { not: null },
      paymentFeeMinor: null,
      paidAt: { gte: new Date(now.getTime() - 3 * 86_400_000) },
    },
    select: { id: true, stripeChargeId: true },
    orderBy: { paidAt: "desc" },
    take: 10,
  });
  let filled = 0;
  for (const o of orders) if (await recordStripeFees(o.id, o.stripeChargeId!).catch(() => false)) filled += 1;
  return filled;
}

/** RG-POST-02 : nouveaux liens pour les commandes à venir d'une adresse, chez une organisation. Rien si aucune. */
export async function sendTicketsLookup(organizationId: string, email: string, locale: Locale): Promise<void> {
  const now = new Date();
  const orders = await db.order.findMany({
    where: { organizationId, buyerEmail: email.trim().toLowerCase(), status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    include: {
      event: { select: { title: true, startsAt: true, endsAt: true, timezone: true } },
      organization: { select: { name: true, subdomain: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const upcoming = orders.filter((o) => effectiveEnd(o.event.startsAt, o.event.endsAt) >= now);
  if (upcoming.length === 0) return;
  const first = upcoming[0]!;
  const brand = await emailBrandFor(organizationId);
  const mail = ticketsLookupEmail({
    brand,
    locale,
    organizationName: first.organization.name,
    orders: upcoming.map((o) => ({
      eventTitle: o.event.title,
      when: formatDateTime(o.event.startsAt, o.event.timezone, locale),
      url: ticketsUrl(o.organization, o.id, o.accessTokenVersion),
    })),
  });
  await sendEmail({
    ...mail,
    to: first.buyerEmail,
    template: "order.lookup",
    category: "TRANSACTIONAL",
    organizationId,
    fromName: brand.fromName,
    replyTo: brand.replyTo,
  });
}

/** Validation, puis effets de bord hors transaction : e-mail, ou remboursement d'un paiement non honoré. */
/** Après la validation : e-mail de confirmation, puis règlement du vendeur s'il s'agit d'une revente. */
export async function afterOrderPaid(orderId: string): Promise<void> {
  await sendOrderConfirmation(orderId).catch((err) => console.error("confirmation non envoyée", orderId, err));
  await settleResale(orderId).catch((err) => console.error("revente à régler", orderId, err));
  // section 9.20 : nouvelle commande (hors revente, signalée à part) et paliers de jauge
  const o = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      reference: true,
      source: true,
      totalMinor: true,
      organizationId: true,
      eventId: true,
      event: { select: { title: true } },
      _count: { select: { tickets: true } },
    },
  });
  if (o && o.source === "ONLINE") {
    // billets offerts et reventes : pas de notification de vente
    await notifyNewOrder(o.organizationId, { id: o.id, reference: o.reference, eventTitle: o.event.title, tickets: o._count.tickets });
    if (o.totalMinor > 0) await qualifyReferral(o.organizationId).catch((err) => console.error("parrainage", err instanceof Error ? err.message : "erreur"));
    await notifySalesMilestone(o.eventId);
  }
}

export async function completeOrder(orderId: string, payment?: Parameters<typeof finalizeOrder>[1]): Promise<FinalizeOutcome> {
  const outcome = await finalizeOrder(orderId, payment);
  // frais réels relevés d'abord : le remboursement du vendeur en dépend (RG-FEE-51)
  if (outcome === "PAID" && payment?.chargeId)
    await recordStripeFees(orderId, payment.chargeId).catch((err) => console.error("frais Stripe à relever", orderId, err));
  if (outcome === "PAID") await afterOrderPaid(orderId);
  if (outcome === "REFUND_REQUIRED") await refundUnfulfilledPayment(orderId).catch((err) => console.error("remboursement à reprendre", orderId, err));
  return outcome;
}

/** RG-BUY-08 : au retour de Stripe, on n'attend pas le webhook si le paiement est déjà confirmé. */
export async function syncPaymentFromStripe(orderId: string): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true, stripePaymentIntentId: true, organizationId: true } });
  const s = stripe();
  if (!s || !order?.stripePaymentIntentId || order.status !== "PENDING") return;
  const account = await db.stripeAccount.findUnique({ where: { organizationId: order.organizationId }, select: { stripeAccountId: true } });
  if (!account) return;
  const pi = await s.paymentIntents.retrieve(order.stripePaymentIntentId, {}, { stripeAccount: account.stripeAccountId });
  if (pi.status !== "succeeded") return;
  await completeOrder(orderId, {
    paymentIntentId: pi.id,
    amountMinor: pi.amount_received,
    currency: pi.currency,
    chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null),
    paymentMethodType: pi.payment_method_types[0] ?? null,
  });
}

export async function getBuyerOrder(orderId: string) {
  return db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      event: true,
      organization: { select: { subdomain: true, slug: true } },
      items: { include: { ticketType: { select: { name: true } }, priceTier: { select: { name: true } } } },
      tickets: {
        include: { ticketType: { select: { name: true } }, seat: { select: { label: true, row: { select: { name: true } } } } },
        orderBy: [{ ticketTypeId: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

const INVALID_TICKET = {
  fr: {
    RESOLD: "BILLET REVENDU · NON VALABLE",
    REFUNDED: "BILLET REMBOURSÉ · NON VALABLE",
    EVENT_CANCELLED: "ÉVÉNEMENT ANNULÉ · NON VALABLE",
    other: "BILLET NON VALABLE",
  },
  en: {
    RESOLD: "TICKET RESOLD · NOT VALID",
    REFUNDED: "TICKET REFUNDED · NOT VALID",
    EVENT_CANCELLED: "EVENT CANCELLED · NOT VALID",
    other: "TICKET NOT VALID",
  },
  es: {
    RESOLD: "ENTRADA REVENDIDA · NO VÁLIDA",
    REFUNDED: "ENTRADA REEMBOLSADA · NO VÁLIDA",
    EVENT_CANCELLED: "EVENTO CANCELADO · NO VÁLIDA",
    other: "ENTRADA NO VÁLIDA",
  },
  de: {
    RESOLD: "TICKET WEITERVERKAUFT · UNGÜLTIG",
    REFUNDED: "TICKET ERSTATTET · UNGÜLTIG",
    EVENT_CANCELLED: "VERANSTALTUNG ABGESAGT · UNGÜLTIG",
    other: "TICKET UNGÜLTIG",
  },
  it: {
    RESOLD: "BIGLIETTO RIVENDUTO · NON VALIDO",
    REFUNDED: "BIGLIETTO RIMBORSATO · NON VALIDO",
    EVENT_CANCELLED: "EVENTO ANNULLATO · NON VALIDO",
    other: "BIGLIETTO NON VALIDO",
  },
  pt: {
    RESOLD: "BILHETE REVENDIDO · NÃO VÁLIDO",
    REFUNDED: "BILHETE REEMBOLSADO · NÃO VÁLIDO",
    EVENT_CANCELLED: "EVENTO CANCELADO · NÃO VÁLIDO",
    other: "BILHETE NÃO VÁLIDO",
  },
  nl: {
    RESOLD: "TICKET DOORVERKOCHT · NIET GELDIG",
    REFUNDED: "TICKET TERUGBETAALD · NIET GELDIG",
    EVENT_CANCELLED: "EVENEMENT GEANNULEERD · NIET GELDIG",
    other: "TICKET NIET GELDIG",
  },
};

/** Mention d'un billet qui n'est plus valable, dans le PDF (section 9.12). */
function invalidTicketLabel(reason: string, locale: string): string {
  const c: Record<string, string> = pick(INVALID_TICKET, locale);
  return c[reason] ?? c.other!;
}
