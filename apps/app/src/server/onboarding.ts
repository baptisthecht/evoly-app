import "server-only";
import { canCreateOrganization, CoreError } from "@evoly/core";
import { db } from "@/lib/db";
import { findCountry } from "@/lib/countries";
import { audit } from "./audit";
import { subdomainAvailability } from "./subdomains";
import { normalizePromotionCode, type Acquisition } from "@evoly/core";
import { findPromotionFor, OFFER_COOKIE, redeemPromotion } from "./promotions";
import type { Prisma } from "@evoly/db";

/** Version des conditions d'utilisation et de l'accord de sous-traitance acceptée à la création (RG-LEG-05). */
export const TERMS_VERSION = "2026-10"; // conditions d'utilisation : contacts importés (responsabilité de l'organisateur)

export interface CreateOrganizationInput {
  name: string;
  subdomain: string;
  country: string;
  type: "INDIVIDUAL" | "ASSOCIATION" | "COMPANY" | "PUBLIC_BODY";
}

/** Création d'une organisation par son futur propriétaire (US-ONB-01, RG-ONB-01, RG-ONB-02, RG-ORG-04). */
export async function createOrganization(
  userId: string,
  input: CreateOrganizationInput,
  acquisition: Acquisition | null = null,
  offerCode?: string | null,
) {
  const country = findCountry(input.country);
  if (!country) throw new CoreError("COUNTRY_NOT_AVAILABLE");
  const availability = await subdomainAvailability(input.subdomain);
  if (!availability.ok) throw new CoreError(`SUBDOMAIN_${availability.reason}`);

  const ownedFree = await db.organization.count({
    where: {
      deletedAt: null,
      members: { some: { userId, role: { systemKey: "OWNER" } } },
      NOT: {
        subscription: {
          planId: "pro",
          status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
        },
      },
    },
  });
  // offres commerciales gérées dans l'administration (docs/OFFRES.md) : le seul endroit où elles sont attribuées
  const now = new Date();
  if (offerCode === undefined) offerCode = await offerCodeFromCookie();
  const promotion = await findPromotionFor(db, {
    userId,
    country: country.code,
    organizationType: input.type,
    offerCode,
    source: acquisition?.source ?? null,
    now,
  });
  if (
    !canCreateOrganization({
      ownedFreeOrganizations: ownedFree,
      startsAsPro: promotion?.planId === "pro",
    })
  )
    throw new CoreError("PRO_REQUIRED_FOR_ANOTHER_ORGANIZATION");

  const ownerRole = await db.role.findUnique({
    where: { systemKey: "OWNER" },
    select: { id: true },
  });
  if (!ownerRole) throw new Error("Rôles système absents : lancer le seed");

  const org = await db.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        ...(acquisition
          ? { acquisition: acquisition as unknown as Prisma.InputJsonValue }
          : {}),
        name: input.name.trim(),
        slug: availability.value,
        subdomain: availability.value,
        type: input.type,
        country: country.code,
        currency: country.currency,
        locale: country.locale,
        timezone: country.timezone,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        members: { create: { userId, roleId: ownerRole.id } },
      },
    });
    // offre : attribuée une seule fois, sans dépasser son plafond ; sinon l'offre Free
    const grantedUntil = promotion
      ? await redeemPromotion(tx, promotion, {
          organizationId: created.id,
          userId,
          now,
        })
      : null;
    await tx.subscription.create({
      data:
        grantedUntil && promotion
          ? {
              organizationId: created.id,
              planId: promotion.planId,
              status: "ACTIVE",
              currency: country.currency,
              currentPeriodEnd: grantedUntil,
            } // attribué par Evoly : redevient Free seul
          : {
              organizationId: created.id,
              planId: "free",
              status: "NONE",
              currency: country.currency,
            },
    });
    await tx.session.updateMany({
      where: { userId },
      data: { activeOrganizationId: created.id },
    });
    return {
      ...created,
      promotionCode: grantedUntil && promotion ? promotion.code : null,
    };
  });

  await audit({
    action: "organization.created",
    organizationId: org.id,
    actorUserId: userId,
    targetType: "Organization",
    targetId: org.id,
    metadata: {
      country: country.code,
      ...(org.promotionCode ? { promotion: org.promotionCode } : {}),
    },
  });
  // section 9.22 : organisation parrainée (code mémorisé à l'arrivée sur l'app)
  try {
    const { cookies } = await import("next/headers");
    const { attachReferral, REFERRAL_COOKIE } = await import("./referrals");
    await attachReferral(
      org.id,
      userId,
      (await cookies()).get(REFERRAL_COOKIE)?.value,
    );
    // section 9.32 : organisateur inscrit par le lien d'un lieu partenaire
    const { attachVenueReferral, VENUE_COOKIE } = await import("./venues");
    await attachVenueReferral(
      org.id,
      (await cookies()).get(VENUE_COOKIE)?.value,
    );
  } catch {
    // hors requête (tests, scripts) : pas de parrainage
  }
  return org;
}

/** Code de la campagne suivie, mémorisé à l'arrivée (hors requête, par exemple en test : aucun). */
async function offerCodeFromCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return normalizePromotionCode((await cookies()).get(OFFER_COOKIE)?.value);
  } catch {
    return null;
  }
}
