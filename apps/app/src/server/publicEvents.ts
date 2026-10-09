import "server-only";
import { availableFor, effectivePrice, nextTier, type PriceTierInput } from "@evoly/core";
import { cache } from "react";
import { db } from "@/lib/db";
import { getPlans } from "./plans";
import { env } from "@/lib/env";
import { organizationPublicUrl } from "./urls";
import { effectivePlan, hasFeature } from "@evoly/core";
import { isPrepublished, salesOpeningAt } from "@evoly/core";
import { publiclyVisible } from "./publication";
import { presaleUsable } from "./presale";

const VISIBLE_STATUSES = ["PUBLISHED", "SALES_PAUSED", "CANCELLED", "ENDED"] as const;

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  subdomain: true,
  locale: true,
  timezone: true,
  currency: true,
  brand: { select: { displayName: true, logoUrl: true, faviconUrl: true, primaryColor: true, accentColor: true, hideEvolyBranding: true } },
  subscription: { select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } },
} as const;

async function publicOrg(where: { subdomain: string } | { id: string }) {
  const org = await db.organization.findFirst({ where: { ...where, status: "ACTIVE", deletedAt: null }, select: ORG_SELECT });
  if (!org) return null;
  const plan = effectivePlan(org.subscription, new Date());
  const features = (await getPlans())[plan].features;
  const branded = hasFeature(features, "BRANDING");
  // RG-BRD-03 : en Free, thème Evoly et mention ; en Pro, la mention peut être retirée (US-BRD-02)
  const hide = hasFeature(features, "REMOVE_EVOLY_BRANDING") && (org.brand?.hideEvolyBranding ?? true);
  return { ...org, plan, features, branded, brand: branded ? org.brand : null, showPoweredBy: !hide };
}

export type PublicOrganization = NonNullable<Awaited<ReturnType<typeof publicOrg>>>;

export type SiteResolution =
  | { kind: "ORG"; org: PublicOrganization }
  | { kind: "EVENT"; org: PublicOrganization; eventId: string }
  | { kind: "REDIRECT"; base: string; rootPath: string }
  | { kind: "DISABLED"; fallback: string | null };

/**
 * RG-DOM-01 : ce qu'affiche un hôte. Clé : sous-domaine (organisation, événement, ancienne adresse)
 * ou « _d_ » suivi d'un domaine personnalisé. Les offres sont vérifiées à chaque lecture (RG-SUB-08, RG-CDM-04).
 */
// pas de cache entre les visites : suspension, vente du dernier billet, revente et marque doivent être visibles aussitôt
export const resolveSite = cache((key: string): Promise<SiteResolution | null> => resolveSiteUncached(key));

async function resolveSiteUncached(key: string): Promise<SiteResolution | null> {
  if (key.startsWith("_d_")) {
    const cd = await db.customDomain.findUnique({ where: { domain: key.slice(3) } });
    if (!cd) return { kind: "DISABLED", fallback: null };
    const org = await publicOrg({ id: cd.organizationId });
    if (!org) return { kind: "DISABLED", fallback: null };
    if (cd.status !== "ACTIVE" || !hasFeature(org.features, "CUSTOM_DOMAINS"))
      return { kind: "DISABLED", fallback: org.subdomain ? organizationPublicUrl(org.subdomain) : null };
    return cd.scope === "EVENT" && cd.eventId ? { kind: "EVENT", org, eventId: cd.eventId } : { kind: "ORG", org };
  }
  const org = await publicOrg({ subdomain: key });
  if (org) return { kind: "ORG", org };
  const event = await db.event.findFirst({ where: { subdomain: key, deletedAt: null }, select: { id: true, slug: true, organizationId: true } });
  if (event) {
    const owner = await publicOrg({ id: event.organizationId });
    if (!owner?.subdomain) return null;
    if (hasFeature(owner.features, "EVENT_SUBDOMAINS")) return { kind: "EVENT", org: owner, eventId: event.id };
    return { kind: "REDIRECT", base: organizationPublicUrl(owner.subdomain), rootPath: `/${event.slug}` }; // retour en Free : vers l'adresse de l'organisation
  }
  const redirect = await db.hostRedirect.findUnique({ where: { host: `${key}.${env().NEXT_PUBLIC_BASE_DOMAIN}` } });
  if (redirect && redirect.expiresAt > new Date()) {
    const target = await publicOrg({ id: redirect.organizationId });
    if (target?.subdomain) return { kind: "REDIRECT", base: organizationPublicUrl(target.subdomain), rootPath: "" }; // RG-SDM-03
  }
  return null;
}

/** Organisation d'un site public, quel que soit l'hôte (sous-domaine, domaine personnalisé, sous-domaine d'événement). */
export const getPublicOrganization = cache(async (key: string) => {
  const site = await resolveSite(key);
  return site && (site.kind === "ORG" || site.kind === "EVENT") ? site.org : null;
});

export interface PublicTicketType {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  tierName: string | null;
  next: { priceMinor: number; startsAt: Date } | null;
  remaining: number;
  quantity: number | null;
  minPerOrder: number;
  maxPerOrder: number;
  onSale: boolean;
}

function toTier(t: {
  id: string;
  priceMinor: number;
  startsAt: Date | null;
  endsAt: Date | null;
  quantityLimit: number | null;
  quantitySold: number;
  quantityHeld: number;
  sortOrder: number;
}): PriceTierInput {
  return t;
}

/** Événement public : jamais un brouillon ni un événement supprimé (RG-EVT-03). */
export function loadPublicEvent(
  where: { organizationId: string; slug: string } | { id: string },
  options: { allowDraft?: boolean; codeOnly?: boolean; presaleCode?: string | null } = {},
) {
  return loadPublicEventOnce(JSON.stringify(where), !!options.allowDraft, !!options.codeOnly, options.presaleCode ?? "");
}

// mis en commun le temps d'une visite (métadonnées et page) : aucune donnée gardée d'une visite à l'autre
const loadPublicEventOnce = cache((where: string, allowDraft: boolean, codeOnly: boolean, presaleCode: string) =>
  loadPublicEventUncached(JSON.parse(where), { allowDraft, codeOnly, presaleCode: presaleCode || null }),
);

async function loadPublicEventUncached(
  where: { organizationId: string; slug: string } | { id: string },
  options: { allowDraft?: boolean; codeOnly?: boolean; presaleCode?: string | null } = {},
) {
  const event = await db.event.findFirst({
    where: {
      ...("id" in where ? { id: where.id } : { organizationId: where.organizationId, slug: where.slug }),
      deletedAt: null,
      ...(options.allowDraft ? {} : { status: { in: [...VISIBLE_STATUSES] } }),
    },
    include: {
      ticketTypes: {
        where: { status: { in: ["ACTIVE", "SOLD_OUT"] }, visibility: options.codeOnly ? "CODE_ONLY" : "VISIBLE" },
        include: { priceTiers: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!event) return null;
  const now = new Date();
  const totals = await db.ticketType.aggregate({ where: { eventId: event.id }, _sum: { quantitySold: true, quantityHeld: true } });
  const eventStock = { capacity: event.capacity, soldTotal: totals._sum.quantitySold ?? 0, heldTotal: totals._sum.quantityHeld ?? 0 };
  const opensAt = salesOpeningAt(event); // RG-PRG-02 : jamais avant la publication programmée
  // RG-PRV-02 : un code de prévente valable ouvre la vente avant l\'ouverture publique, pour ce visiteur
  const presale = !!options.presaleCode && !!opensAt && opensAt > now && event.status === "PUBLISHED" && (await presaleUsable(event, options.presaleCode, now));
  const salesOpen = event.status === "PUBLISHED" && (presale || !opensAt || opensAt <= now) && now < (event.salesEndAt ?? event.startsAt);
  const ticketTypes: PublicTicketType[] = event.ticketTypes.map((t) => {
    const tiers = t.priceTiers.map(toTier);
    const price = effectivePrice(t.priceMinor, tiers, now);
    const upcoming = event.showNextPriceTier ? nextTier(tiers, now) : null;
    const inWindow = (presale || !t.salesStartAt || t.salesStartAt <= now) && (!t.salesEndAt || now < t.salesEndAt);
    const remaining = t.status === "SOLD_OUT" ? 0 : availableFor(t, eventStock);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      priceMinor: price.priceMinor,
      tierName: price.tierId ? (t.priceTiers.find((p) => p.id === price.tierId)?.name ?? null) : null,
      next: upcoming && upcoming.priceMinor !== price.priceMinor && upcoming.startsAt ? { priceMinor: upcoming.priceMinor, startsAt: upcoming.startsAt } : null,
      remaining,
      quantity: t.quantity ?? event.capacity,
      minPerOrder: t.minPerOrder,
      maxPerOrder: Math.min(t.maxPerOrder, event.maxTicketsPerOrder),
      onSale: salesOpen && inWindow && remaining > 0,
    };
  });
  return {
    event,
    ticketTypes,
    salesOpen,
    salesOpensAt: opensAt,
    presale,
    prepublished: isPrepublished(event, now),
    soldOut: ticketTypes.length > 0 && ticketTypes.every((t) => t.remaining <= 0),
  };
}

export type PublicEventData = NonNullable<Awaited<ReturnType<typeof loadPublicEvent>>>;

/** RG-PUB-07 : événements publics à venir, puis passés. */
export async function listPublicEvents(organizationId: string) {
  const now = new Date();
  const events = await db.event.findMany({
    where: { organizationId, deletedAt: null, visibility: "PUBLIC", status: { in: ["PUBLISHED", "SALES_PAUSED", "ENDED"] }, ...publiclyVisible() },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      startsAt: true,
      timezone: true,
      city: true,
      locationName: true,
      locationType: true,
      status: true,
      coverImageUrl: true,
    },
    orderBy: { startsAt: "asc" },
  });
  return {
    upcoming: events.filter((e) => e.startsAt >= now && e.status !== "ENDED"),
    past: events.filter((e) => e.startsAt < now || e.status === "ENDED").reverse(),
  };
}
