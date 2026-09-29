import "server-only";
import { canOwnerOnly, CoreError, effectiveEnd, isValidTimeZone } from "@evoly/core";
import { db } from "@/lib/db";
import { LAUNCH_COUNTRIES } from "@/lib/countries";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { deletePublicFile } from "./storage";

export interface OrganizationSettingsInput {
  name: string;
  legalName?: string | null;
  type: "INDIVIDUAL" | "ASSOCIATION" | "COMPANY" | "PUBLIC_BODY";
  description?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  country: string;
  currency: string;
  locale: "fr" | "en";
  timezone: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  vatNumber?: string | null;
  vatRegistered: boolean;
}

/** La devise n'est plus modifiable après la première vente (US-ORG-01). */
export async function hasSales(organizationId: string): Promise<boolean> {
  return (await db.order.count({ where: { organizationId, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } } })) > 0;
}

/** Numéro de TVA : espaces et points retirés, préfixe du pays ajouté si absent, format européen vérifié. */
export function normalizeVatNumber(input: string | null | undefined, country: string): string | null {
  if (!input?.trim()) return null;
  let v = input.toUpperCase().replace(/[\s.\-]/g, "");
  if (/^\d/.test(v)) v = `${country.toUpperCase()}${v}`;
  // numéros de TVA de l’Union : 8 à 12 caractères après le préfixe du pays (BE : 10 chiffres, FR : 11, NL : 12…)
  if (!/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(v)) throw new CoreError("VAT_NUMBER_INVALID");
  return v;
}

/** US-ORG-01 : informations de l'organisation, dont celles des relevés de commissions (raison sociale, adresse, TVA). */
export async function updateOrganizationSettings(ctx: OrgContext, input: OrganizationSettingsInput) {
  const country = input.country.toUpperCase();
  if (!LAUNCH_COUNTRIES.some((c) => c.code === country)) throw new CoreError("COUNTRY_NOT_SUPPORTED");
  if (!isValidTimeZone(input.timezone)) throw new CoreError("INVALID_TIMEZONE");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { currency: true } });
  const currency = input.currency.toUpperCase();
  if (currency !== org.currency) {
    if (await hasSales(ctx.organization.id)) throw new CoreError("CURRENCY_LOCKED");
    if (!(await db.planCurrencyTerms.findFirst({ where: { currency }, select: { planId: true } }))) throw new CoreError("CURRENCY_NOT_SUPPORTED");
  }
  const website = input.website?.trim() ? (/^https?:\/\//i.test(input.website.trim()) ? input.website.trim() : `https://${input.website.trim()}`) : null;
  if (website && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(website)) throw new CoreError("WEBSITE_INVALID");
  const updated = await db.organization.update({
    where: { id: ctx.organization.id },
    data: {
      name: input.name.trim(),
      legalName: input.legalName?.trim() || null,
      type: input.type,
      description: input.description?.trim() || null,
      contactEmail: input.contactEmail?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      website,
      country,
      currency,
      locale: input.locale,
      timezone: input.timezone,
      addressLine1: input.addressLine1?.trim() || null,
      addressLine2: input.addressLine2?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      city: input.city?.trim() || null,
      vatNumber: normalizeVatNumber(input.vatNumber, country),
      vatRegistered: input.vatRegistered,
    },
  });
  await audit({ action: "organization.settings_updated", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Organization", targetId: ctx.organization.id });
  return updated;
}

export type DeletionBlocker = "UPCOMING_SALES" | "ACTIVE_SUBSCRIPTION";

/** RG-ORG-06 : impossible tant qu'un événement à venir a des participants ou qu'un abonnement Pro va se renouveler. */
export async function deletionBlockers(organizationId: string, now = new Date()): Promise<DeletionBlocker[]> {
  const blockers: DeletionBlocker[] = [];
  const events = await db.event.findMany({ where: { organizationId, deletedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } }, select: { id: true, startsAt: true, endsAt: true } });
  const upcoming = events.filter((e) => effectiveEnd(e.startsAt, e.endsAt) >= now).map((e) => e.id);
  if (upcoming.length && (await db.ticket.count({ where: { eventId: { in: upcoming }, status: { in: ["VALID", "CHECKED_IN"] } } })) > 0) blockers.push("UPCOMING_SALES");
  const sub = await db.subscription.findUnique({ where: { organizationId }, select: { status: true, stripeSubscriptionId: true, cancelAtPeriodEnd: true } });
  if (sub?.stripeSubscriptionId && ["TRIALING", "ACTIVE", "PAST_DUE", "UNPAID", "INCOMPLETE"].includes(sub.status) && !sub.cancelAtPeriodEnd) blockers.push("ACTIVE_SUBSCRIPTION");
  return blockers;
}

/**
 * RG-ORG-06 et RG-RGPD-02 : suppression par le propriétaire, après double confirmation. Les commandes restent pour la
 * comptabilité, anonymisées ; les contacts des participants, la marque, les domaines et les accès de l'équipe sont supprimés.
 */
export async function deleteOrganization(ctx: OrgContext, confirmation: string, now = new Date()) {
  if (!canOwnerOnly(ctx.membership, "ORGANIZATION_DELETE")) throw new CoreError("OWNER_ONLY");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, include: { brand: true } });
  if (confirmation.trim() !== org.name.trim()) throw new CoreError("DELETE_CONFIRMATION_MISMATCH");
  const blockers = await deletionBlockers(org.id, now);
  if (blockers.length > 0) throw new CoreError(`DELETE_BLOCKED_${blockers[0]}`);
  const id = org.id;
  await db.$transaction([
    db.order.updateMany({ where: { organizationId: id }, data: { buyerFirstName: "Anonyme", buyerLastName: "", buyerPhone: null, marketingOptIn: false } }),
    db.$executeRaw`UPDATE "Order" SET "buyerEmail" = 'anonyme+' || id || '@evoly.invalid' WHERE "organizationId" = ${id}`,
    db.ticket.updateMany({ where: { event: { organizationId: id } }, data: { holderFirstName: null, holderLastName: null } }),
    db.$executeRaw`UPDATE "EmailMessage" SET "toEmail" = 'anonyme@evoly.invalid' WHERE "organizationId" = ${id}`,
    db.resaleListing.updateMany({ where: { event: { organizationId: id } }, data: { sellerEmail: "anonyme@evoly.invalid" } }),
    db.contact.deleteMany({ where: { organizationId: id } }),
    db.invitation.updateMany({ where: { organizationId: id, status: "PENDING" }, data: { status: "REVOKED" } }),
    db.scannerLink.updateMany({ where: { event: { organizationId: id }, revokedAt: null }, data: { revokedAt: now } }),
    db.customDomain.deleteMany({ where: { organizationId: id } }),
    db.hostRedirect.deleteMany({ where: { organizationId: id } }),
    db.event.updateMany({ where: { organizationId: id, status: { notIn: ["ARCHIVED", "CANCELLED"] } }, data: { status: "ARCHIVED" } }),
    db.organizationBrand.deleteMany({ where: { organizationId: id } }),
    db.organizationMember.deleteMany({ where: { organizationId: id } }),
    db.organization.update({ where: { id }, data: { status: "DELETED", deletedAt: now, name: "Organisation supprimée", slug: `supprimee-${id}`, subdomain: null, legalName: null, description: null, contactEmail: null, phone: null, website: null, addressLine1: null, addressLine2: null, postalCode: null, city: null, region: null, vatNumber: null } }),
  ]);
  await Promise.all([deletePublicFile(org.brand?.logoUrl), deletePublicFile(org.brand?.faviconUrl)]);
  await audit({ action: "organization.deleted", organizationId: id, actorUserId: ctx.user.id, targetType: "Organization", targetId: id });
}
