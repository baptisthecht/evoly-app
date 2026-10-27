import { db } from "@/lib/db";
import type { OrgContext } from "./context";

/**
 * Accueil vivant de l'organisation : le prochain événement, les dernières commandes, la recette
 * des 30 derniers jours jour par jour, le remplissage des événements à venir, et ce qu'il reste à faire.
 */
export async function homeOverview(ctx: OrgContext, now = new Date()) {
  const organizationId = ctx.organization.id;
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const upcomingWhere = {
    organizationId,
    deletedAt: null,
    status: { in: ["PUBLISHED" as const, "SALES_PAUSED" as const] },
    startsAt: { gte: now },
  };
  const [upcoming, recent, days, drafts, noCover] = await Promise.all([
    db.event.findMany({
      where: upcomingWhere,
      orderBy: { startsAt: "asc" },
      take: 6,
      select: {
        id: true,
        title: true,
        startsAt: true,
        timezone: true,
        city: true,
        locationName: true,
        coverImageUrl: true,
        capacity: true,
        ticketTypes: {
          where: { status: { not: "ARCHIVED" } },
          select: { quantity: true, quantitySold: true },
        },
      },
    }),
    db.order.findMany({
      where: {
        organizationId,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        paidAt: { not: null },
      },
      orderBy: { paidAt: "desc" },
      take: 6,
      select: {
        id: true,
        buyerFirstName: true,
        buyerLastName: true,
        buyerEmail: true,
        totalMinor: true,
        currency: true,
        paidAt: true,
        event: { select: { title: true } },
      },
    }),
    db.$queryRaw<Array<{ day: Date; total: bigint | number | null }>>`
      SELECT date_trunc('day', "paidAt") AS day, SUM("totalMinor" - COALESCE("refundedMinor", 0)) AS total
      FROM "Order"
      WHERE "organizationId" = ${organizationId} AND status IN ('PAID', 'PARTIALLY_REFUNDED') AND "paidAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    db.event.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "DRAFT",
        updatedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) },
      },
    }),
    db.event.count({ where: { ...upcomingWhere, coverImageUrl: null } }),
  ]);
  const fill = upcoming.map((e) => {
    const sold = e.ticketTypes.reduce((n, t) => n + t.quantitySold, 0);
    const limited = e.ticketTypes.every((t) => t.quantity != null);
    const capacity =
      e.capacity ??
      (limited
        ? e.ticketTypes.reduce((n, t) => n + (t.quantity ?? 0), 0)
        : null);
    return {
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      timezone: e.timezone,
      sold,
      capacity,
    };
  });
  const byDay = new Map(
    days.map((d) => [d.day.toISOString().slice(0, 10), Number(d.total ?? 0)]),
  );
  const revenue = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(since.getTime() + (i + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return { day, totalMinor: byDay.get(day) ?? 0 };
  });
  const next = upcoming[0] ?? null;
  return {
    next: next
      ? {
          ...fill[0]!,
          coverImageUrl: next.coverImageUrl,
          place: next.city ?? next.locationName ?? "",
        }
      : null,
    recent: recent.map((o) => ({
      id: o.id,
      name: `${o.buyerFirstName} ${o.buyerLastName}`.trim() || o.buyerEmail,
      event: o.event.title,
      totalMinor: o.totalMinor,
      currency: o.currency,
      paidAt: o.paidAt!,
    })),
    revenue,
    fill,
    todo: {
      stripe: !ctx.stripe || ctx.stripe.status !== "ACTIVE",
      noCover,
      drafts,
    },
  };
}
