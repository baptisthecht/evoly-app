/**
 * Rythme des ventes d'un événement (refonte A3, docs/DECISIONS.md) : la part des places vendues comparée à la part
 * de la période de vente déjà passée. « 312 sur 400 » ne dit pas si c'est bien ; trois semaines avant la soirée,
 * c'est très bien, la veille, c'est inquiétant.
 */
export type SalesPace =
  | "ahead" // on vend plus vite que le temps ne passe
  | "onTrack" // écart de moins de PACE_TOLERANCE
  | "behind" // on vend moins vite que le temps ne passe
  | "soldOut"
  | "notStarted" // la période de vente n'a pas commencé
  | "unknown"; // jauge illimitée ou période de vente vide : rien à comparer

export interface SalesPaceInput {
  sold: number;
  /** Places en vente ; null pour une jauge illimitée. */
  capacity: number | null;
  salesStart: Date;
  salesEnd: Date;
  now: Date;
}

export interface SalesPaceResult {
  pace: SalesPace;
  /** Part vendue, de 0 à 1 ; null pour une jauge illimitée. */
  soldRatio: number | null;
  /** Part de la période de vente passée, de 0 à 1 ; null si la période est vide. */
  elapsedRatio: number | null;
  /** Date du complet si le rythme moyen depuis l'ouverture se maintient, quand elle tombe avant la fin des ventes. */
  soldOutAt: Date | null;
}

/** Écart (en part de la jauge) en dessous duquel on reste « dans le rythme ». */
export const PACE_TOLERANCE = 0.05;
/** Au tout début des ventes, on ne dit jamais « un peu lent » : trop tôt pour juger. */
export const PACE_GRACE = 0.1;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Début de la période de vente d'un événement : l'ouverture des ventes, sinon la publication, sinon la création. */
export function salesWindow(e: {
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  startsAt: Date;
}): { salesStart: Date; salesEnd: Date } {
  return {
    salesStart: e.salesStartAt ?? e.publishedAt ?? e.createdAt,
    salesEnd: e.salesEndAt ?? e.startsAt,
  };
}

export function salesPace(i: SalesPaceInput): SalesPaceResult {
  const span = i.salesEnd.getTime() - i.salesStart.getTime();
  const elapsedRatio =
    span > 0 ? clamp((i.now.getTime() - i.salesStart.getTime()) / span) : null;
  if (i.capacity == null || i.capacity <= 0)
    return { pace: "unknown", soldRatio: null, elapsedRatio, soldOutAt: null };
  const soldRatio = clamp(i.sold / i.capacity);
  if (i.sold >= i.capacity)
    return { pace: "soldOut", soldRatio, elapsedRatio, soldOutAt: null };
  if (elapsedRatio == null)
    return { pace: "unknown", soldRatio, elapsedRatio, soldOutAt: null };
  if (i.now.getTime() < i.salesStart.getTime())
    return { pace: "notStarted", soldRatio, elapsedRatio, soldOutAt: null };

  const gap = soldRatio - elapsedRatio;
  const pace: SalesPace =
    gap > PACE_TOLERANCE
      ? "ahead"
      : gap < -PACE_TOLERANCE && elapsedRatio >= PACE_GRACE
        ? "behind"
        : "onTrack";

  // projection : le rythme moyen depuis l'ouverture, prolongé jusqu'au complet
  const spent = i.now.getTime() - i.salesStart.getTime();
  let soldOutAt: Date | null = null;
  if (i.sold > 0 && spent > 0) {
    const at = i.now.getTime() + ((i.capacity - i.sold) * spent) / i.sold;
    if (at < i.salesEnd.getTime()) soldOutAt = new Date(at);
  }
  return { pace, soldRatio, elapsedRatio, soldOutAt };
}
