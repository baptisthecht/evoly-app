import "server-only";
import { canCreateOrganization, CoreError } from "@evoly/core";
import { db } from "@/lib/db";
import { findCountry } from "@/lib/countries";
import { audit } from "./audit";
import { subdomainAvailability } from "./subdomains";

/** Version des conditions d'utilisation et de l'accord de sous-traitance acceptée à la création (RG-LEG-05). */
export const TERMS_VERSION = "2026-09";

export interface CreateOrganizationInput {
  name: string;
  subdomain: string;
  country: string;
  type: "INDIVIDUAL" | "ASSOCIATION" | "COMPANY" | "PUBLIC_BODY";
}

/** Création d'une organisation par son futur propriétaire (US-ONB-01, RG-ONB-01, RG-ONB-02, RG-ORG-04). */
export async function createOrganization(userId: string, input: CreateOrganizationInput) {
  const country = findCountry(input.country);
  if (!country) throw new CoreError("COUNTRY_NOT_AVAILABLE");
  const availability = await subdomainAvailability(input.subdomain);
  if (!availability.ok) throw new CoreError(`SUBDOMAIN_${availability.reason}`);

  const ownedFree = await db.organization.count({
    where: {
      deletedAt: null,
      members: { some: { userId, role: { systemKey: "OWNER" } } },
      NOT: { subscription: { planId: "pro", status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } } },
    },
  });
  if (!canCreateOrganization({ ownedFreeOrganizations: ownedFree, startsAsPro: false })) throw new CoreError("PRO_REQUIRED_FOR_ANOTHER_ORGANIZATION");

  const ownerRole = await db.role.findUnique({ where: { systemKey: "OWNER" }, select: { id: true } });
  if (!ownerRole) throw new Error("Rôles système absents : lancer le seed");

  const org = await db.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
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
        subscription: { create: { planId: "free", status: "NONE", currency: country.currency } },
        members: { create: { userId, roleId: ownerRole.id } },
      },
    });
    await tx.session.updateMany({ where: { userId }, data: { activeOrganizationId: created.id } });
    return created;
  });

  await audit({
    action: "organization.created",
    organizationId: org.id,
    actorUserId: userId,
    targetType: "Organization",
    targetId: org.id,
    metadata: { country: country.code },
  });
  // section 9.22 : organisation parrainée (code mémorisé à l'arrivée sur l'app)
  try {
    const { cookies } = await import("next/headers");
    const { attachReferral, REFERRAL_COOKIE } = await import("./referrals");
    await attachReferral(org.id, userId, (await cookies()).get(REFERRAL_COOKIE)?.value);
  } catch {
    // hors requête (tests, scripts) : pas de parrainage
  }
  return org;
}
