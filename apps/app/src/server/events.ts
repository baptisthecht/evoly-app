import "server-only";
import {
  assertTransition,
  checkTicketPrice,
  CoreError,
  EVENT_TRANSITIONS,
  eventPublicCode,
  isValidTimeZone,
  parseMajorToMinor,
  publicationBlockers,
  slugify,
  uniqueSlug,
  zonedLocalToUtc, normalizeAccessCode } from "@evoly/core";
import { Prisma } from "@evoly/db";
import { currencyExponent } from "@evoly/i18n";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";

export type LocationType = "PHYSICAL" | "ONLINE" | "HYBRID";

export interface EventEssentials {
  title: string;
  summary?: string | null;
  startsAtLocal: string;
  endsAtLocal?: string | null;
  timezone: string;
  locationType: LocationType;
  locationName?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  onlineUrl?: string | null;
}

export interface EventSettingsInput extends EventEssentials {
  capacity?: number | null;
  maxTicketsPerOrder: number;
  maxTicketsPerBuyer?: number | null;
  /** version affichée par le formulaire (date de dernière modification), pour détecter une modification simultanée */
  version?: string | null;
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  accessCode?: string | null;
  refundPolicy: "NON_REFUNDABLE" | "UNTIL_DEADLINE" | "ON_REQUEST" | "ALWAYS";
  refundDeadlineLocal?: string | null;
  salesStartLocal?: string | null;
  salesEndLocal?: string | null;
  resaleEnabled: boolean;
  resaleCutoffMinutes: number;
  showResaleSection: boolean;
}

const LOCKED: readonly string[] = ["CANCELLED", "ENDED", "ARCHIVED"];

export function exponentFor(currency: string): number {
  return currencyExponent(currency);
}

/** Prix saisi → unités mineures, avec le minimum d'un billet payant (RG-TKT-01). */
export function parsePrice(input: string, currency: string): number {
  const minor = parseMajorToMinor(input, exponentFor(currency));
  if (minor == null) throw new CoreError("INVALID_PRICE");
  const check = checkTicketPrice(minor, currency);
  if (check === "BELOW_MINIMUM") throw new CoreError("PRICE_BELOW_MINIMUM");
  if (check !== "OK") throw new CoreError("INVALID_PRICE");
  return minor;
}

function resolveDates(e: Pick<EventEssentials, "startsAtLocal" | "endsAtLocal" | "timezone">) {
  if (!isValidTimeZone(e.timezone)) throw new CoreError("INVALID_TIMEZONE");
  const startsAt = zonedLocalToUtc(e.startsAtLocal, e.timezone);
  const endsAt = e.endsAtLocal ? zonedLocalToUtc(e.endsAtLocal, e.timezone) : null;
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) throw new CoreError("END_BEFORE_START");
  return { startsAt, endsAt };
}

function resolveLocation(e: EventEssentials, defaultCountry: string) {
  const physical = e.locationType !== "ONLINE";
  const online = e.locationType !== "PHYSICAL";
  if (physical && !e.locationName?.trim() && !e.addressLine1?.trim()) throw new CoreError("LOCATION_REQUIRED");
  if (online) {
    if (!e.onlineUrl) throw new CoreError("ONLINE_URL_REQUIRED");
    if (!/^https:\/\//i.test(e.onlineUrl)) throw new CoreError("ONLINE_URL_INVALID");
  }
  return {
    locationType: e.locationType,
    locationName: physical ? e.locationName?.trim() || null : null,
    addressLine1: physical ? e.addressLine1?.trim() || null : null,
    postalCode: physical ? e.postalCode?.trim() || null : null,
    city: physical ? e.city?.trim() || null : null,
    country: physical ? (e.country || defaultCountry).toUpperCase() : null,
    onlineUrl: online ? e.onlineUrl!.trim() : null,
  };
}

async function freeSlug(organizationId: string, title: string): Promise<string> {
  const base = slugify(title) || "evenement";
  const rows = await db.event.findMany({ where: { organizationId, slug: { startsWith: base } }, select: { slug: true } });
  // chemins réservés des pages publiques (billets de l'acheteur…)
  return uniqueSlug(base, new Set([...rows.map((r) => r.slug), "billets", "commande", "revente", "api"]));
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Création rapide (US-EVT-01) : l'essentiel, le lieu et un premier tarif. L'événement reste un brouillon. */
export async function createEvent(ctx: OrgContext, e: EventEssentials, firstTicket: { name: string; price: string; quantity?: number | null }) {
  const o = ctx.organization;
  const { startsAt, endsAt } = resolveDates(e);
  const location = resolveLocation(e, o.country);
  const priceMinor = parsePrice(firstTicket.price, o.currency);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const event = await db.event.create({
        data: {
          organizationId: o.id,
          slug: await freeSlug(o.id, e.title),
          publicCode: eventPublicCode(),
          title: e.title.trim(),
          summary: e.summary?.trim() || null,
          currency: o.currency,
          locale: o.locale,
          timezone: e.timezone,
          startsAt,
          endsAt,
          ...location,
          createdById: ctx.user.id,
          ticketTypes: { create: { name: firstTicket.name.trim(), priceMinor, currency: o.currency, quantity: firstTicket.quantity ?? null, sortOrder: 0 } },
        },
      });
      await audit({ action: "event.created", organizationId: o.id, actorUserId: ctx.user.id, targetType: "Event", targetId: event.id });
      return event;
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 4) throw err; // code public ou identifiant déjà pris : on réessaie
    }
  }
  throw new Error("inaccessible");
}

export async function findEvent(ctx: OrgContext, eventId: string) {
  const event = await db.event.findFirst({ where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null } });
  if (!event) throw new CoreError("NOT_FOUND");
  return event;
}

function assertEditable(event: { status: string }) {
  if (LOCKED.includes(event.status)) throw new CoreError("EVENT_LOCKED");
}

/** Réglages d'un événement (autosauvegarde, RG-EVT-01). Changement de date ou de lieu après publication : RG-EVT-05. */
export async function updateEventSettings(ctx: OrgContext, eventId: string, input: EventSettingsInput) {
  const event = await findEvent(ctx, eventId);
  assertEditable(event);
  const { startsAt, endsAt } = resolveDates(input);
  const location = resolveLocation(input, ctx.organization.country);
  const toUtc = (v?: string | null) => (v ? zonedLocalToUtc(v, input.timezone) : null);
  const salesStartAt = toUtc(input.salesStartLocal);
  const salesEndAt = toUtc(input.salesEndLocal);
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) throw new CoreError("SALES_END_BEFORE_START");
  const refundDeadlineAt = input.refundPolicy === "UNTIL_DEADLINE" ? toUtc(input.refundDeadlineLocal) : null;
  if (input.refundPolicy === "UNTIL_DEADLINE" && !refundDeadlineAt) throw new CoreError("REFUND_DEADLINE_REQUIRED");
  if (input.capacity != null) {
    const totals = await db.ticketType.aggregate({ where: { eventId }, _sum: { quantitySold: true, quantityHeld: true } });
    if (input.capacity < (totals._sum.quantitySold ?? 0) + (totals._sum.quantityHeld ?? 0)) throw new CoreError("CAPACITY_BELOW_SOLD");
  }
  const published = event.status === "PUBLISHED" || event.status === "SALES_PAUSED";
  const majorChange =
    published &&
    (event.startsAt.getTime() !== startsAt.getTime() ||
      (event.endsAt?.getTime() ?? null) !== (endsAt?.getTime() ?? null) ||
      event.locationType !== location.locationType ||
      event.locationName !== location.locationName ||
      event.addressLine1 !== location.addressLine1 ||
      event.city !== location.city);
  // RG-EVT-10 : un autre membre a enregistré depuis l'affichage du formulaire → on enregistre quand même, et on prévient
  const concurrent = !!input.version && event.updatedAt.getTime() > Date.parse(input.version) + 500;
  const updated = await db.event.update({
    where: { id: event.id },
    data: {
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      timezone: input.timezone,
      startsAt,
      endsAt,
      ...location,
      capacity: input.capacity ?? null,
      maxTicketsPerOrder: input.maxTicketsPerOrder,
      maxTicketsPerBuyer: input.maxTicketsPerBuyer ?? null,
      visibility: input.visibility,
      ...(await accessCodeData(event.id, event.accessCodeHash, input)),
      refundPolicy: input.refundPolicy,
      refundDeadlineAt,
      salesStartAt,
      salesEndAt,
      resaleEnabled: input.resaleEnabled,
      resaleCutoffMinutes: input.resaleCutoffMinutes,
      showResaleSection: input.showResaleSection,
      ...(majorChange ? { lastMajorChangeAt: new Date() } : {}),
    },
  });
  if (event.resaleEnabled && !input.resaleEnabled) {
    const { cancelListingsForEvent } = await import("./resale");
    await cancelListingsForEvent(event.id); // RG-RSL-09 : annonces ouvertes retirées, vendeurs prévenus
  }
  if (majorChange) {
    // Les e-mails aux acheteurs (anciennes et nouvelles valeurs) partiront avec la file d'envoi (étape 6).
    await audit({ action: "event.major_change", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Event", targetId: event.id, metadata: { previousStartsAt: event.startsAt.toISOString(), startsAt: startsAt.toISOString() } });
  }
  return Object.assign(updated, { concurrent });
}

async function blockersFor(ctx: OrgContext, eventId: string, startsAt: Date) {
  const active = await db.ticketType.findMany({ where: { eventId, status: "ACTIVE" }, select: { priceMinor: true, priceTiers: { select: { priceMinor: true } } } });
  return publicationBlockers({
    activeTicketTypes: active.length,
    hasPaidTicketTypes: active.some((t) => t.priceMinor > 0 || t.priceTiers.some((p) => p.priceMinor > 0)),
    stripeChargesEnabled: !!ctx.stripe?.chargesEnabled,
    startsAt,
    now: new Date(),
  });
}

/** Conditions de publication, affichées dans la liste de contrôle de l'aperçu (RG-EVT-02). */
export async function eventPublicationBlockers(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  return blockersFor(ctx, eventId, event.startsAt);
}

export async function publishEvent(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  assertTransition(EVENT_TRANSITIONS, event.status, "PUBLISHED", "événement");
  const blockers = await blockersFor(ctx, eventId, event.startsAt);
  if (blockers.length > 0) throw new CoreError(`PUBLISH_${blockers[0]}`);
  await db.event.update({ where: { id: event.id }, data: { status: "PUBLISHED", publishedAt: event.publishedAt ?? new Date() } });
  await audit({ action: event.status === "DRAFT" ? "event.published" : "event.sales_resumed", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Event", targetId: event.id });
}

export async function pauseSales(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  assertTransition(EVENT_TRANSITIONS, event.status, "SALES_PAUSED", "événement");
  await db.event.update({ where: { id: event.id }, data: { status: "SALES_PAUSED" } });
  await audit({ action: "event.sales_paused", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Event", targetId: event.id });
}

/** RG-EVT-07 : copie en brouillon, sans commandes ni compteurs, dates à revoir. */
export async function duplicateEvent(ctx: OrgContext, eventId: string) {
  const source = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    include: { ticketTypes: { include: { priceTiers: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!source) throw new CoreError("NOT_FOUND");
  const title = `${source.title} (copie)`.slice(0, 120);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const copy = await db.event.create({
        data: {
          organizationId: source.organizationId,
          slug: await freeSlug(source.organizationId, source.title),
          publicCode: eventPublicCode(),
          title,
          summary: source.summary,
          description: source.description ?? undefined,
          coverImageUrl: source.coverImageUrl,
          visibility: source.visibility === "PRIVATE" ? "UNLISTED" : source.visibility,
          locale: source.locale,
          currency: source.currency,
          timezone: source.timezone,
          startsAt: source.startsAt,
          endsAt: source.endsAt,
          doorsOpenAt: source.doorsOpenAt,
          locationType: source.locationType,
          venueId: source.venueId,
          locationName: source.locationName,
          addressLine1: source.addressLine1,
          addressLine2: source.addressLine2,
          postalCode: source.postalCode,
          city: source.city,
          region: source.region,
          country: source.country,
          latitude: source.latitude,
          longitude: source.longitude,
          onlineUrl: source.onlineUrl,
          capacity: source.capacity,
          maxTicketsPerOrder: source.maxTicketsPerOrder,
          maxTicketsPerBuyer: source.maxTicketsPerBuyer,
          checkoutHoldMinutes: source.checkoutHoldMinutes,
          requireBuyerPhone: source.requireBuyerPhone,
          allowHolderChange: source.allowHolderChange,
          showNextPriceTier: source.showNextPriceTier,
          resaleEnabled: source.resaleEnabled,
          resaleCutoffMinutes: source.resaleCutoffMinutes,
          showResaleSection: source.showResaleSection,
          refundPolicy: source.refundPolicy,
          confirmationMessage: source.confirmationMessage,
          faq: source.faq ?? undefined,
          primaryColor: source.primaryColor,
          accentColor: source.accentColor,
          createdById: ctx.user.id,
          ticketTypes: {
            create: source.ticketTypes.map((t) => ({
              name: t.name,
              description: t.description,
              priceMinor: t.priceMinor,
              currency: t.currency,
              vatRateBps: t.vatRateBps,
              quantity: t.quantity,
              minPerOrder: t.minPerOrder,
              maxPerOrder: t.maxPerOrder,
              status: t.status === "SOLD_OUT" ? "ACTIVE" : t.status,
              visibility: t.visibility,
              sortOrder: t.sortOrder,
              isNominative: t.isNominative,
              requireHolderEmail: t.requireHolderEmail,
              resaleAllowed: t.resaleAllowed,
              priceTiers: { create: t.priceTiers.map((p) => ({ name: p.name, priceMinor: p.priceMinor, startsAt: p.startsAt, endsAt: p.endsAt, quantityLimit: p.quantityLimit, sortOrder: p.sortOrder })) },
            })),
          },
        },
      });
      await audit({ action: "event.duplicated", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Event", targetId: copy.id, metadata: { sourceId: source.id } });
      return copy;
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 4) throw err;
    }
  }
  throw new Error("inaccessible");
}

/** RG-EVT-08 : suppression d'un brouillon sans commande ; sinon, archivage. */
export async function deleteDraft(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  if (event.status !== "DRAFT") throw new CoreError("ONLY_DRAFTS_CAN_BE_DELETED");
  if ((await db.order.count({ where: { eventId } })) > 0) throw new CoreError("EVENT_HAS_ORDERS");
  await db.event.delete({ where: { id: event.id } });
  await audit({ action: "event.deleted", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Event", targetId: event.id, metadata: { title: event.title } });
}

export async function listEvents(organizationId: string) {
  const events = await db.event.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, title: true, slug: true, status: true, startsAt: true, timezone: true, capacity: true, city: true, locationType: true, ticketTypes: { select: { quantitySold: true, quantity: true } } },
    orderBy: { startsAt: "asc" },
  });
  return events.map((e) => ({
    ...e,
    sold: e.ticketTypes.reduce((n, t) => n + t.quantitySold, 0),
    total: e.capacity ?? (e.ticketTypes.every((t) => t.quantity != null) ? e.ticketTypes.reduce((n, t) => n + (t.quantity ?? 0), 0) : null),
  }));
}

export async function getEventWithTickets(ctx: OrgContext, eventId: string) {
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    include: { ticketTypes: { include: { priceTiers: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!event) throw new CoreError("NOT_FOUND");
  return event;
}

/** RG-PUB-06 : un événement privé a toujours un code ; seul son hachage est enregistré. */
async function accessCodeData(eventId: string, currentHash: string | null, input: { visibility: string; accessCode?: string | null }) {
  if (input.visibility !== "PRIVATE") return { accessCodeHash: null };
  if (!input.accessCode?.trim()) {
    if (!currentHash) throw new CoreError("ACCESS_CODE_REQUIRED");
    return {};
  }
  const code = normalizeAccessCode(input.accessCode);
  if (!code) throw new CoreError("ACCESS_CODE_INVALID");
  const { accessCodeHash } = await import("./questions");
  return { accessCodeHash: accessCodeHash(eventId, code) };
}
