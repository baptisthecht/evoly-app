import "server-only";
import type { PlanFeature, PlanId } from "@evoly/core";
import { EUR_TERMS, type FeeTerms } from "@evoly/core";
import { db } from "@/lib/db";

interface PlanRecord {
  id: PlanId;
  features: PlanFeature[];
  terms: Record<string, FeeTerms>;
}

let cache: { at: number; plans: Record<PlanId, PlanRecord> } | null = null;

/** Offres chargées depuis la base, gardées une minute en mémoire. */
export async function getPlans(): Promise<Record<PlanId, PlanRecord>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.plans;
  const rows = await db.plan.findMany({ include: { currencyTerms: true } });
  const plans = {} as Record<PlanId, PlanRecord>;
  for (const id of ["free", "pro", "partner"] as const) {
    const row = rows.find((r) => r.id === id);
    const terms: Record<string, FeeTerms> = {};
    for (const t of row?.currencyTerms ?? [])
      terms[t.currency] = { planId: id, currency: t.currency, fixedMinor: t.feeFixedMinor, rateBps: row!.feeRateBps, capMinor: t.feeCapMinor };
    if (!terms.EUR) terms.EUR = EUR_TERMS[id];
    // Partenaire sans ligne en base : fonctionnalités de Pro plutôt qu'aucune
    plans[id] = { id, features: (row?.features ?? (id === "partner" ? (plans.pro?.features ?? []) : [])) as PlanFeature[], terms };
  }
  cache = { at: Date.now(), plans };
  return plans;
}
