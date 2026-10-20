import {
  normalizePromotionCode,
  pickPromotion,
  promotionGrantEnd,
  promotionStatus,
  promotionText,
  type PromotionRule,
  type PromotionStatus,
} from "@evoly/core";
import type { Prisma, Promotion } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";

/** Code de la campagne suivie (lien ?offre=CODE), gardé 60 jours : nécessaire pour accorder l'offre demandée. */
export const OFFER_COOKIE = "evoly_offer";
export const OFFER_COOKIE_MAX_AGE = 60 * 24 * 3600;

type Client = Prisma.TransactionClient | typeof db;
const toRule = (p: Promotion): PromotionRule & { showOnSite: boolean; messages: unknown; name: string } => ({
  id: p.id,
  code: p.code,
  name: p.name,
  active: p.active,
  planId: p.planId,
  durationValue: p.durationValue,
  durationUnit: p.durationUnit,
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  audience: p.audience,
  countries: p.countries,
  organizationTypes: p.organizationTypes,
  sources: p.sources,
  maxRedemptions: p.maxRedemptions,
  redeemedCount: p.redeemedCount,
  perOwnerLimit: p.perOwnerLimit,
  priority: p.priority,
  createdAt: p.createdAt,
  showOnSite: p.showOnSite,
  messages: p.messages,
});
const running = (now: Date) => ({
  active: true,
  AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
});

/** Offre qui s'applique à une nouvelle organisation, ou aucune (conditions, plafonds, limite par organisateur). */
export async function findPromotionFor(
  client: Client,
  input: { userId: string; country: string; organizationType: string; offerCode: string | null; source: string | null; now: Date },
) {
  const rows = await client.promotion.findMany({ where: running(input.now) });
  if (!rows.length) return null;
  const owned = await client.promotionRedemption.groupBy({ by: ["promotionId"], where: { userId: input.userId }, _count: { _all: true } });
  return pickPromotion(rows.map(toRule), {
    now: input.now,
    country: input.country,
    organizationType: input.organizationType,
    offerCode: normalizePromotionCode(input.offerCode),
    source: input.source,
    ownerRedemptions: Object.fromEntries(owned.map((o) => [o.promotionId, o._count._all])),
  });
}

/**
 * Attribue l'offre à l'organisation, une seule fois : le compteur n'augmente que s'il reste de la place (une seule
 * requête, donc jamais au-delà du plafond, même pour deux inscriptions simultanées). Renvoie la fin du plan offert.
 */
export async function redeemPromotion(
  tx: Prisma.TransactionClient,
  promotion: PromotionRule,
  input: { organizationId: string; userId: string; now: Date },
): Promise<Date | null> {
  const taken =
    await tx.$executeRaw`UPDATE "Promotion" SET "redeemedCount" = "redeemedCount" + 1, "updatedAt" = now() WHERE "id" = ${promotion.id} AND "active" = true AND ("maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions")`;
  if (taken !== 1) return null;
  const grantedUntil = promotionGrantEnd(promotion, input.now);
  await tx.promotionRedemption.create({ data: { promotionId: promotion.id, organizationId: input.organizationId, userId: input.userId, grantedUntil } });
  return grantedUntil;
}

export interface OfferDisplay {
  code: string;
  banner: string;
  short: string;
  cta: string;
  endsAt: string | null;
}

/** Offre annoncée au public (site vitrine, inscription) : la plus prioritaire, ouverte à toute nouvelle organisation. */
export async function publicOffer(locale: string, now = new Date()): Promise<OfferDisplay | null> {
  const rows = await db.promotion.findMany({
    where: { ...running(now), audience: "ALL_NEW", showOnSite: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "asc" }],
  });
  for (const r of rows) {
    if (promotionStatus(r, now) !== "RUNNING") continue;
    const text = promotionText(r.messages, locale);
    if (text) return { code: r.code, ...text, endsAt: r.endsAt?.toISOString() ?? null };
  }
  return null;
}

/** Offre d'une campagne précise (lien ?offre=CODE), si elle est en cours ; sinon l'offre publique. */
export async function offerForVisitor(code: string | null | undefined, locale: string, now = new Date()): Promise<OfferDisplay | null> {
  const c = normalizePromotionCode(code);
  if (c) {
    const r = await db.promotion.findUnique({ where: { code: c } });
    const text = r && promotionStatus(r, now) === "RUNNING" ? promotionText(r.messages, locale) : null;
    if (r && text) return { code: r.code, ...text, endsAt: r.endsAt?.toISOString() ?? null };
  }
  return publicOffer(locale, now);
}

export interface PromotionStatsRow {
  id: string;
  code: string;
  name: string;
  status: PromotionStatus;
  audience: Promotion["audience"];
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptions: number;
  stillOffered: number;
  published: number;
  firstSale: number;
  paidPro: number;
}

/** Statistiques de chaque offre : bénéficiaires, et jusqu'où ils sont allés (publication, vente, Pro payant). */
export async function promotionStats(now = new Date()): Promise<PromotionStatsRow[]> {
  const rows = await db.promotion.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: { redemptions: { select: { organizationId: true, grantedUntil: true } } },
  });
  const orgIds = rows.flatMap((r) => r.redemptions.map((x) => x.organizationId));
  const [published, sold, paid] = orgIds.length
    ? await Promise.all([
        db.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: orgIds }, status: { not: "DRAFT" } } }),
        db.order.groupBy({ by: ["organizationId"], where: { organizationId: { in: orgIds }, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } } }),
        db.subscription.findMany({
          where: { organizationId: { in: orgIds }, planId: "pro", stripeSubscriptionId: { not: null }, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
          select: { organizationId: true },
        }),
      ])
    : [[], [], []];
  const has = (list: Array<{ organizationId: string }>) => new Set(list.map((x) => x.organizationId));
  const [pub, sale, pro] = [has(published), has(sold), has(paid)];
  return rows.map((r) => {
    const ids = r.redemptions.map((x) => x.organizationId);
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      status: promotionStatus(r, now),
      audience: r.audience,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      maxRedemptions: r.maxRedemptions,
      redemptions: ids.length,
      stillOffered: r.redemptions.filter((x) => x.grantedUntil > now).length,
      published: ids.filter((i) => pub.has(i)).length,
      firstSale: ids.filter((i) => sale.has(i)).length,
      paidPro: ids.filter((i) => pro.has(i)).length,
    };
  });
}

export interface PromotionInput {
  code: string;
  name: string;
  note: string | null;
  active: boolean;
  planId: string;
  durationValue: number;
  durationUnit: "DAY" | "MONTH";
  startsAt: Date | null;
  endsAt: Date | null;
  audience: "ALL_NEW" | "LINK";
  countries: string[];
  organizationTypes: Array<"INDIVIDUAL" | "ASSOCIATION" | "COMPANY" | "PUBLIC_BODY">;
  sources: string[];
  maxRedemptions: number | null;
  perOwnerLimit: number;
  priority: number;
  showOnSite: boolean;
  messages: Record<string, { banner: string; short: string; cta: string }>;
}

/** Création ou modification d'une offre depuis l'administration, tracée dans le journal. */
export async function savePromotion(actorUserId: string, input: PromotionInput, id?: string) {
  const data = { ...input, messages: input.messages as Prisma.InputJsonValue };
  const row = id ? await db.promotion.update({ where: { id }, data }) : await db.promotion.create({ data });
  await audit({
    action: id ? "promotion.updated" : "promotion.created",
    actorType: "ADMIN",
    actorUserId,
    targetType: "Promotion",
    targetId: row.id,
    metadata: { code: row.code },
  });
  return row;
}

export async function setPromotionActive(actorUserId: string, id: string, active: boolean) {
  const row = await db.promotion.update({ where: { id }, data: { active } });
  await audit({
    action: active ? "promotion.activated" : "promotion.suspended",
    actorType: "ADMIN",
    actorUserId,
    targetType: "Promotion",
    targetId: id,
    metadata: { code: row.code },
  });
  return row;
}
