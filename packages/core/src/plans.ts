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
  "PRESALE_CODES",
  "PREPAID_OPTIONS",
  "EMBED_WIDGET",
  "AMBASSADORS",
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];
/** « partner » : offre Partenaire, Pro offert par Evoly sans commission, attribuée par les administrateurs. */
export type PlanId = "free" | "pro" | "partner";
export type SubscriptionStatus = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "UNPAID" | "CANCELED" | "INCOMPLETE";

/** Tous les champs sont obligatoires (null s'il n'y a rien) : un appel qui en oublie un se tromperait d'offre (18 octobre 2026). */
export interface SubscriptionInput {
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
  /** fin de l'essai : pour une offre attribuée par Evoly (sans abonnement Stripe), elle fait foi */
  trialEndsAt: Date | null;
  /** abonnement Stripe : Stripe met lui-même fin à l'essai ou à la période ; null : offre attribuée par Evoly, dont les dates font foi */
  stripeSubscriptionId: string | null;
}

/** Délai d'impayé avant rétrogradation (RG-SUB-06). */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Offre réellement en vigueur pour une organisation.
 * Pro (ou Partenaire) si essai ou abonnement actif, ou impayé depuis moins de 7 jours, ou résilié mais période payée en cours.
 */
export function effectivePlan(sub: SubscriptionInput | null | undefined, now: Date): PlanId {
  if (!sub || (sub.planId !== "pro" && sub.planId !== "partner")) return "free";
  const paid: PlanId = sub.planId; // Pro, ou Partenaire (mêmes règles de période)
  // offre attribuée par Evoly (aucun abonnement Stripe, champ lu et vide) : à sa date de fin, retour en Free
  const local = sub.stripeSubscriptionId === null;
  const over = (d: Date | null | undefined) => !!d && d.getTime() <= now.getTime();
  switch (sub.status) {
    case "TRIALING":
      return local && over(sub.trialEndsAt) ? "free" : paid;
    case "ACTIVE":
      return local && over(sub.currentPeriodEnd) ? "free" : paid;
    case "PAST_DUE":
      if (!sub.pastDueSince) return paid;
      return now.getTime() - sub.pastDueSince.getTime() < PAST_DUE_GRACE_DAYS * 86_400_000 ? paid : "free";
    case "CANCELED":
      return sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime() ? paid : "free";
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
