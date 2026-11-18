import {
  effectivePlan,
  PAST_DUE_GRACE_DAYS,
  type SubscriptionInput,
  type SubscriptionStatus,
} from "./plans";

/** RG-SUB-02 : un essai de 14 jours par organisation, jamais deux, ni après un abonnement payé. */
export function trialEligible(
  sub:
    | { trialEndsAt: Date | null; mollieMandateId?: string | null }
    | null
    | undefined,
): boolean {
  return !sub || (sub.trialEndsAt == null && !sub.mollieMandateId);
}

export type BillingInterval = "MONTH" | "YEAR";

/**
 * Fin d'une période d'abonnement (docs/MOLLIE.md, lot 6) : même jour et même heure, un mois ou un an plus tard, ramenée au
 * dernier jour du mois quand ce jour n'existe pas (31 janvier : 28 ou 29 février).
 */
export function addBillingInterval(
  start: Date,
  interval: BillingInterval,
): Date {
  const month = start.getUTCMonth() + (interval === "YEAR" ? 12 : 1);
  const year = start.getUTCFullYear();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(start.getUTCDate(), lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

/** Renouvellement prélevé au plus tôt un jour avant l'échéance : la tâche horaire a une journée devant elle, sans trou dans l'offre. */
export const RENEWAL_LEAD_MS = 86_400_000;
/** Période impayée : nouvelle tentative de prélèvement 3 jours après un échec, 3 tentatives en tout, avant le retour en Free (RG-SUB-06). */
export const RENEWAL_RETRY_DAYS = 3;
export const RENEWAL_MAX_ATTEMPTS = 3;

/**
 * Paiement de vérification d'un abonnement pris pendant une période en cours (essai, Pro offert) : 0,02 €, le minimum de
 * Bancontact chez Mollie (carte 0 €, Belfius et Pay by Bank 0,01 €), pour proposer tous les moyens ; remboursé aussitôt.
 */
export const SETUP_AMOUNT_MINOR = 2;

/** Date de la prochaine tentative après l'échec de la tentative n, ou null s'il n'y en a plus. */
export function nextRenewalAttempt(
  failedAt: Date,
  attempt: number,
): Date | null {
  return attempt >= RENEWAL_MAX_ATTEMPTS
    ? null
    : new Date(failedAt.getTime() + RENEWAL_RETRY_DAYS * 86_400_000);
}

/** Abonnement payé par Mollie dont Evoly prélève encore les renouvellements : ni résilié, ni terminé. */
export function renewsWithMollie(
  sub:
    | {
        billingProvider?: string | null;
        mollieMandateId?: string | null;
        status: SubscriptionStatus;
        cancelAtPeriodEnd: boolean;
      }
    | null
    | undefined,
): boolean {
  return (
    !!sub &&
    sub.billingProvider === "MOLLIE" &&
    !!sub.mollieMandateId &&
    (sub.status === "ACTIVE" || sub.status === "PAST_DUE") &&
    !sub.cancelAtPeriodEnd
  );
}

/**
 * Début de la première période payée par Mollie : à la fin de ce qui court encore (essai, Pro offert daté ou période
 * résiliée), pour ne rien perdre ; tout de suite en Free ou si un paiement est en retard.
 */
export function firstPeriodStart(
  sub: SubscriptionInput | null | undefined,
  now: Date,
): Date {
  if (
    !sub ||
    effectivePlan(sub, now) !== "pro" ||
    sub.status === "PAST_DUE" ||
    sub.status === "UNPAID"
  )
    return now;
  const running = [
    sub.status === "TRIALING" ? sub.trialEndsAt : null,
    sub.currentPeriodEnd,
  ].filter((d): d is Date => !!d && d.getTime() > now.getTime());
  return running.length
    ? new Date(Math.max(...running.map((d) => d.getTime())))
    : now;
}

/** Jours restants avant la rétrogradation automatique d'un abonnement impayé (RG-SUB-06), ou null. */
export function daysBeforeDowngrade(
  sub: { status: SubscriptionStatus; pastDueSince: Date | null },
  now: Date,
): number | null {
  if (
    (sub.status !== "PAST_DUE" && sub.status !== "UNPAID") ||
    !sub.pastDueSince
  )
    return null;
  const end = sub.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

/** Prix mensuel équivalent de l'offre annuelle, et économie par rapport au mensuel. */
export function yearlySavings(monthlyMinor: number, yearlyMinor: number) {
  const perMonth = Math.round(yearlyMinor / 12);
  return {
    perMonthMinor: perMonth,
    savingBps:
      monthlyMinor > 0
        ? Math.round(
            ((monthlyMinor * 12 - yearlyMinor) * 10_000) / (monthlyMinor * 12),
          )
        : 0,
  };
}
