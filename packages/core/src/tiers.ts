import type { Minor } from "./money";

export interface PriceTierInput {
  id: string;
  priceMinor: Minor;
  startsAt?: Date | null;
  endsAt?: Date | null;
  quantityLimit?: number | null;
  quantitySold: number;
  quantityHeld: number;
  sortOrder: number;
}

export interface EffectivePrice {
  priceMinor: Minor;
  tierId: string | null;
}

function inPeriod(tier: PriceTierInput, now: Date): boolean {
  const started = !tier.startsAt || tier.startsAt.getTime() <= now.getTime();
  const notEnded = !tier.endsAt || now.getTime() < tier.endsAt.getTime();
  return started && notEnded;
}

/** Un palier s'applique si sa période est en cours et s'il lui reste au moins une place. */
export function isTierActive(tier: PriceTierInput, now: Date): boolean {
  return inPeriod(tier, now) && tierRemaining(tier) > 0;
}

/**
 * Prix effectif affiché d'un tarif (RG-TKT-07) : premier palier actif dans l'ordre, sinon prix de base.
 * `tiersEnabled` vaut false si l'organisation n'a pas (ou plus) les prix dynamiques
 * et que la règle de maintien (décision 6) ne s'applique pas.
 */
export function effectivePrice(basePriceMinor: Minor, tiers: readonly PriceTierInput[], now: Date, tiersEnabled = true): EffectivePrice {
  if (tiersEnabled) {
    for (const tier of sortTiers(tiers)) {
      if (isTierActive(tier, now)) return { priceMinor: tier.priceMinor, tierId: tier.id };
    }
  }
  return { priceMinor: basePriceMinor, tierId: null };
}

export interface TierAllocation {
  tierId: string | null;
  priceMinor: Minor;
  quantity: number;
}

/**
 * Répartit une quantité demandée entre paliers : chaque billet prend le prix du premier palier
 * actif qui a encore de la place, puis le prix de base quand plus aucun palier ne s'applique.
 * Exemple : prévente limitée à 100 billets dont 98 vendus, commande de 3 → 2 en prévente, 1 au palier suivant.
 */
export function allocateTiers(basePriceMinor: Minor, tiers: readonly PriceTierInput[], now: Date, quantity: number, tiersEnabled = true): TierAllocation[] {
  const allocations: TierAllocation[] = [];
  let left = quantity;
  if (tiersEnabled) {
    for (const tier of sortTiers(tiers)) {
      if (left === 0) break;
      if (!inPeriod(tier, now)) continue;
      const take = Math.min(left, tierRemaining(tier));
      if (take > 0) {
        allocations.push({ tierId: tier.id, priceMinor: tier.priceMinor, quantity: take });
        left -= take;
      }
    }
  }
  if (left > 0) allocations.push({ tierId: null, priceMinor: basePriceMinor, quantity: left });
  return allocations;
}

function sortTiers(tiers: readonly PriceTierInput[]): PriceTierInput[] {
  return [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Places restantes dans un palier (Infinity si sans quota). */
export function tierRemaining(tier: PriceTierInput): number {
  if (tier.quantityLimit == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, tier.quantityLimit - tier.quantitySold - tier.quantityHeld);
}

/** Prochain palier à venir, pour l'annonce sur la page de vente (US-TKT-04). */
export function nextTier(tiers: readonly PriceTierInput[], now: Date): PriceTierInput | null {
  const upcoming = tiers
    .filter((t) => t.startsAt && t.startsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime() || a.sortOrder - b.sortOrder);
  return upcoming[0] ?? null;
}

export interface TierIssue {
  kind: "GAP" | "OVERLAP";
  from: Date;
  to: Date;
  tierIds: string[];
}

/** Trous et chevauchements de calendrier entre paliers datés (RG-TKT-10). */
export function tierCalendarIssues(tiers: readonly PriceTierInput[]): TierIssue[] {
  const dated = tiers.filter((t) => t.startsAt && t.endsAt).sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime());
  const issues: TierIssue[] = [];
  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1]!;
    const cur = dated[i]!;
    const prevEnd = prev.endsAt!.getTime();
    const curStart = cur.startsAt!.getTime();
    if (curStart > prevEnd) issues.push({ kind: "GAP", from: prev.endsAt!, to: cur.startsAt!, tierIds: [prev.id, cur.id] });
    if (curStart < prevEnd) issues.push({ kind: "OVERLAP", from: cur.startsAt!, to: prev.endsAt!, tierIds: [prev.id, cur.id] });
  }
  return issues;
}
