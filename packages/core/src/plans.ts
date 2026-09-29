export const PLAN_FEATURES = [
  "RESALE",
  "LIVE_STATS",
  "QR_CHECKIN",
  "EVOLY_SUBDOMAIN",
  "TRANSACTIONAL_EMAILS",
  "PROMO_CODES",
  "DYNAMIC_PRICING",
  "EMAIL_MARKETING",
  "BRANDING",
  "REMOVE_EVOLY_BRANDING",
  "CUSTOM_DOMAINS",
  "EVENT_SUBDOMAINS",
  "TEAM_MEMBERS",
  "CUSTOM_ROLES",
  "MULTI_ORGANIZATIONS",
  "SEATING_MAPS",
  "WALLET_PASSES",
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];
export type PlanId = "free" | "pro";
export type SubscriptionStatus = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "UNPAID" | "CANCELED" | "INCOMPLETE";

export interface SubscriptionInput {
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: Date | null;
  pastDueSince?: Date | null;
}

/** Délai d'impayé avant rétrogradation (RG-SUB-06). */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Offre réellement en vigueur pour une organisation.
 * Pro si essai ou abonnement actif, ou impayé depuis moins de 7 jours, ou résilié mais période payée en cours.
 */
export function effectivePlan(sub: SubscriptionInput | null | undefined, now: Date): PlanId {
  if (!sub || sub.planId !== "pro") return "free";
  switch (sub.status) {
    case "TRIALING":
    case "ACTIVE":
      return "pro";
    case "PAST_DUE":
      if (!sub.pastDueSince) return "pro";
      return now.getTime() - sub.pastDueSince.getTime() < PAST_DUE_GRACE_DAYS * 86_400_000 ? "pro" : "free";
    case "CANCELED":
      return sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime() ? "pro" : "free";
    default:
      return "free";
  }
}

/** Contrôle unique d'accès à une fonctionnalité (section 4, RG-ARC-03). */
export function hasFeature(planFeatures: readonly PlanFeature[], feature: PlanFeature): boolean {
  return planFeatures.includes(feature);
}

/** RG-ORG-04 (décision 4) : en Free, un compte ne possède qu'une organisation. */
export const FREE_OWNED_ORGANIZATIONS_LIMIT = 1;

export function canCreateOrganization(input: { ownedFreeOrganizations: number; startsAsPro: boolean }): boolean {
  if (input.startsAsPro) return true;
  return input.ownedFreeOrganizations < FREE_OWNED_ORGANIZATIONS_LIMIT;
}

/** Une organisation supplémentaire repassée en Free passe en lecture seule (RG-ORG-04). */
export function isReadOnlyOrganization(input: { plan: PlanId; isOwnersFirstFreeOrganization: boolean }): boolean {
  return input.plan === "free" && !input.isOwnersFirstFreeOrganization;
}
