/**
 * Champs de l'abonnement dont la règle de l'offre effective a besoin, tous : sans l'identifiant Stripe et la fin d'essai,
 * une offre attribuée par Evoly ne prendrait jamais fin (fonctions et commission du Pro gardées après sa date).
 */
export const PLAN_SUBSCRIPTION_SELECT = {
  planId: true,
  status: true,
  currentPeriodEnd: true,
  pastDueSince: true,
  trialEndsAt: true,
  stripeSubscriptionId: true,
} as const;
