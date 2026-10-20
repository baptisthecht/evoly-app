/**
 * Offre de lancement : le Pro offert 3 mois, sans carte bancaire, à toute organisation créée au plus tard le
 * 31 mars 2027 à 23 h 59 (heure de Bruxelles). Abonnement attribué par Evoly (sans Stripe) : il redevient Free tout seul.
 */
export const LAUNCH_OFFER_UNTIL = "2027-03-31T23:59:59+02:00";
export const LAUNCH_OFFER_MONTHS = 3;

/** Date limite en vigueur : celle du code, remplacée par une date ISO, ou aucune avec « off » (tests, CI). */
export function launchOfferDeadline(setting: string | undefined = undefined): Date | null {
  const raw = setting === undefined || setting === "" ? LAUNCH_OFFER_UNTIL : setting;
  if (raw === "off") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fin du Pro offert à une organisation créée à `now`, ou aucune si l'offre est terminée ou désactivée. */
export function launchOfferEnd(now: Date, setting?: string): Date | null {
  const deadline = launchOfferDeadline(setting);
  if (!deadline || now.getTime() > deadline.getTime()) return null;
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + LAUNCH_OFFER_MONTHS);
  return end;
}
