/**
 * Offres commerciales (campagnes) gérées depuis l'administration : règles pures, sans base de données. Une offre donne
 * un plan pendant une durée à une nouvelle organisation qui remplit ses conditions ; une seule par organisation.
 */

export type PromotionAudience = "ALL_NEW" | "LINK";
export type PromotionDurationUnit = "DAY" | "MONTH";
export type PromotionStatus = "DISABLED" | "SCHEDULED" | "RUNNING" | "ENDED" | "EXHAUSTED";

export interface PromotionRule {
  id: string;
  code: string;
  active: boolean;
  planId: string;
  durationValue: number;
  durationUnit: PromotionDurationUnit;
  startsAt: Date | null;
  endsAt: Date | null;
  audience: PromotionAudience;
  countries: string[];
  organizationTypes: string[];
  sources: string[];
  maxRedemptions: number | null;
  redeemedCount: number;
  perOwnerLimit: number;
  priority: number;
  createdAt?: Date;
}

/** Ce qu'on sait de l'organisation créée et de son créateur. */
export interface PromotionContext {
  now: Date;
  country: string;
  organizationType: string;
  /** Code de campagne du lien suivi (?offre=CODE), s'il y en a un. */
  offerCode: string | null;
  /** Source de la première visite (utm_source), si l'internaute l'a acceptée. */
  source: string | null;
  /** Offres dont ce créateur a déjà profité, par identifiant d'offre. */
  ownerRedemptions: Record<string, number>;
}

export function promotionStatus(p: Pick<PromotionRule, "active" | "startsAt" | "endsAt" | "maxRedemptions" | "redeemedCount">, now: Date): PromotionStatus {
  if (!p.active) return "DISABLED";
  if (p.startsAt && now.getTime() < p.startsAt.getTime()) return "SCHEDULED";
  if (p.endsAt && now.getTime() > p.endsAt.getTime()) return "ENDED";
  if (p.maxRedemptions !== null && p.redeemedCount >= p.maxRedemptions) return "EXHAUSTED";
  return "RUNNING";
}

const matches = (list: string[], value: string | null) => list.length === 0 || (value !== null && list.some((x) => x.toLowerCase() === value.toLowerCase()));

/** Toutes les conditions de l'offre sont remplies. */
export function promotionApplies(p: PromotionRule, ctx: PromotionContext): boolean {
  if (promotionStatus(p, ctx.now) !== "RUNNING") return false;
  if (p.audience === "LINK" && (ctx.offerCode ?? "").toLowerCase() !== p.code.toLowerCase()) return false;
  if (!matches(p.countries, ctx.country)) return false;
  if (!matches(p.organizationTypes, ctx.organizationType)) return false;
  if (!matches(p.sources, ctx.source)) return false;
  return (ctx.ownerRedemptions[p.id] ?? 0) < p.perOwnerLimit;
}

/** L'offre retenue : la plus prioritaire, puis celle du lien suivi, puis la plus récente (jamais au hasard). */
export function pickPromotion<T extends PromotionRule>(promotions: T[], ctx: PromotionContext): T | null {
  const ok = promotions.filter((p) => promotionApplies(p, ctx));
  ok.sort(
    (a, b) =>
      b.priority - a.priority ||
      Number(b.audience === "LINK") - Number(a.audience === "LINK") ||
      (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return ok[0] ?? null;
}

/** Fin du plan offert à une organisation créée à `now`. */
export function promotionGrantEnd(p: Pick<PromotionRule, "durationValue" | "durationUnit">, now: Date): Date {
  const end = new Date(now);
  if (p.durationUnit === "MONTH") end.setUTCMonth(end.getUTCMonth() + p.durationValue);
  else end.setTime(end.getTime() + p.durationValue * 86_400_000);
  return end;
}

export interface PromotionText {
  /** Bandeau : l'offre et ses conditions, en une phrase. */
  banner: string;
  /** Mention courte, dans l'encadré de l'offre Pro. */
  short: string;
  /** Libellé des boutons. */
  cta: string;
}

/** Textes dans la langue du visiteur, sinon en français, puis en anglais ; aucun s'il n'y a pas de bandeau. */
export function promotionText(messages: unknown, locale: string): PromotionText | null {
  if (!messages || typeof messages !== "object") return null;
  const all = messages as Record<string, Partial<PromotionText> | undefined>;
  for (const l of [locale.slice(0, 2), "fr", "en"]) {
    const m = all[l];
    if (m && typeof m.banner === "string" && m.banner.trim()) {
      const banner = m.banner.trim().slice(0, 300);
      return {
        banner,
        short: typeof m.short === "string" && m.short.trim() ? m.short.trim().slice(0, 120) : banner.slice(0, 120),
        cta: typeof m.cta === "string" ? m.cta.trim().slice(0, 60) : "",
      };
    }
  }
  return null;
}

/** Code de campagne valable (lien ?offre=CODE) : 2 à 40 caractères, lettres, chiffres et tirets, en minuscules. */
export function normalizePromotionCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(v) && v.length >= 2 ? v : null;
}
