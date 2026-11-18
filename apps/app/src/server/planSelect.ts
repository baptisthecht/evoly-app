/**
 * Champs de l'abonnement dont la règle de l'offre effective a besoin, tous : sans la fin d'essai et la fin de période,
 * une offre ne prendrait jamais fin (fonctions et commission du Pro gardées après sa date).
 */
export const PLAN_SUBSCRIPTION_SELECT = {
  planId: true,
  status: true,
  currentPeriodEnd: true,
  pastDueSince: true,
  trialEndsAt: true,
} as const;
