import "server-only";
import { effectivePlan, hasFeature } from "@evoly/core";
import { db } from "@/lib/db";
import { getPlans } from "./plans";

/** Marque et mention Evoly de l'image d'aperçu : même règle que les pages publiques (offre effective, RG-BRD-03). */
export async function hasFeatureForOrg(organizationId: string, hideWanted: boolean) {
  const sub = await db.subscription.findUnique({ where: { organizationId }, select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } });
  const features = (await getPlans())[effectivePlan(sub, new Date())].features;
  return { branded: hasFeature(features, "BRANDING"), hidePowered: hasFeature(features, "REMOVE_EVOLY_BRANDING") && hideWanted };
}
