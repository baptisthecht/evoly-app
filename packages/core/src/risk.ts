/** Section 9.24 : signaux de risque du back-office Evoly. */
export type RiskSignal = "NEW_ORG_HIGH_PRICE" | "HIGH_DISPUTE_RATE" | "MANY_REFUNDS";

export function riskSignals(
  o: { createdAt: Date; maxTicketPriceMinor: number; paidOrders: number; disputes: number; refundedOrders: number },
  now: Date,
): RiskSignal[] {
  const out: RiskSignal[] = [];
  // nouvelle organisation (moins de 30 jours) avec un billet à 150 € ou plus
  if (now.getTime() - o.createdAt.getTime() < 30 * 86_400_000 && o.maxTicketPriceMinor >= 15_000) out.push("NEW_ORG_HIGH_PRICE");
  // litiges : au moins 3, ou plus de 1 % des commandes payées sur un volume significatif
  if (o.disputes >= 3 || (o.paidOrders >= 50 && o.disputes / o.paidOrders > 0.01)) out.push("HIGH_DISPUTE_RATE");
  // remboursements : plus de 20 % des commandes payées, à partir de 20 commandes
  if (o.paidOrders >= 20 && o.refundedOrders / o.paidOrders > 0.2) out.push("MANY_REFUNDS");
  return out;
}

/** Taux exprimé en pour cent, arrondi à une décimale (tableau de bord). */
export function ratePercent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}
