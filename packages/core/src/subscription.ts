import { PAST_DUE_GRACE_DAYS, type SubscriptionStatus } from "./plans";

/** Statut Stripe d'un abonnement vers le statut Evoly (RG-SUB-02, RG-SUB-04, RG-SUB-06). */
export function subscriptionStatusFromStripe(status: string): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
      return "INCOMPLETE";
    default:
      return "CANCELED"; // canceled, incomplete_expired, paused
  }
}

/** RG-SUB-02 : un essai de 14 jours par organisation, jamais deux. */
export function trialEligible(sub: { trialEndsAt: Date | null; stripeSubscriptionId: string | null } | null | undefined): boolean {
  return !sub || (sub.trialEndsAt == null && sub.stripeSubscriptionId == null);
}

/** Jours restants avant la rétrogradation automatique d'un abonnement impayé (RG-SUB-06), ou null. */
export function daysBeforeDowngrade(sub: { status: SubscriptionStatus; pastDueSince: Date | null }, now: Date): number | null {
  if ((sub.status !== "PAST_DUE" && sub.status !== "UNPAID") || !sub.pastDueSince) return null;
  const end = sub.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

/** Prix mensuel équivalent de l'offre annuelle, et économie par rapport au mensuel. */
export function yearlySavings(monthlyMinor: number, yearlyMinor: number) {
  const perMonth = Math.round(yearlyMinor / 12);
  return { perMonthMinor: perMonth, savingBps: monthlyMinor > 0 ? Math.round(((monthlyMinor * 12 - yearlyMinor) * 10_000) / (monthlyMinor * 12)) : 0 };
}
