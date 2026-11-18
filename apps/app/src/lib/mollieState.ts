import type { OrgContext } from "@/server/context";

/** État du compte Mollie de l'organisation, tel qu'affiché (Paramètres, accueil). */
export type MollieState =
  "none" | "disconnected" | "needsData" | "inReview" | "pending" | "ready";

export function mollieState(m: OrgContext["mollie"]): MollieState {
  if (!m) return "none";
  if (m.disconnected) return "disconnected";
  if (m.ready) return "ready";
  if (m.onboardingStatus === "NEEDS_DATA") return "needsData";
  if (m.onboardingStatus === "IN_REVIEW") return "inReview";
  return "pending";
}

export const MOLLIE_TONE = {
  none: "neutral",
  disconnected: "danger",
  needsData: "warning",
  inReview: "warning",
  pending: "warning",
  ready: "success",
} as const;
