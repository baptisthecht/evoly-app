import { netOfSums, salesPace, salesWindow } from "@evoly/core";
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
  const [upcoming, recent, days, drafts, noCover, collected] =
    await Promise.all([
      db.event.findMany({
        // refonte A3 : les brouillons datés à venir figurent aussi dans le tableau (« Pas encore en vente »)
        where: {
          organizationId,
          deletedAt: null,
          startsAt: { gte: now },
          status: { in: ["PUBLISHED", "SALES_PAUSED", "DRAFT"] },
        },
        orderBy: { startsAt: "asc" },
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          currency: true,
          slug: true,
          subdomain: true,
          startsAt: true,
          timezone: true,
          salesStartAt: true,
          salesEndAt: true,
          publishedAt: true,
          createdAt: true,
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
          _count: { select: { tickets: true } },
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
      // encaissé par événement (toutes ventes payées, remboursements déduits)
      db.order.groupBy({
        by: ["eventId"],
        where: {
          organizationId,
          status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        },
        _sum: { totalMinor: true, refundedMinor: true },
      }),
    ]);
  const collectedBy = new Map(
    collected.map((c) => [c.eventId, netOfSums(c._sum)]),
  );
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
      status: e.status,
      currency: e.currency,
      collectedMinor: collectedBy.get(e.id) ?? 0,
      slug: e.slug,
      subdomain: e.subdomain,
      startsAt: e.startsAt,
      timezone: e.timezone,
      place: e.city ?? e.locationName ?? "",
      sold,
      capacity,
      // refonte A3 : le rythme des ventes (packages/core/src/pace.ts)
      pace: salesPace({ sold, capacity, ...salesWindow(e), now }),
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
  const nextIndex = upcoming.findIndex((e) => e.status !== "DRAFT");
  const next = nextIndex >= 0 ? upcoming[nextIndex]! : null;
  return {
    next: next
      ? { ...fill[nextIndex]!, coverImageUrl: next.coverImageUrl }
      : null,
    recent: recent.map((o) => ({
      id: o.id,
      name: `${o.buyerFirstName} ${o.buyerLastName}`.trim() || o.buyerEmail,
      event: o.event.title,
      tickets: o._count.tickets,
      totalMinor: o.totalMinor,
      currency: o.currency,
      paidAt: o.paidAt!,
    })),
    revenue,
    /** Les événements à venir, le prochain en vente exclu (il a son bandeau). */
    fill: fill.filter((_, i) => i !== nextIndex),
    todo: {
      stripe: !ctx.stripe || ctx.stripe.status !== "ACTIVE",
      noCover,
      drafts,
    },
  };
}

/**
 * Indicateurs de l'accueil (refonte A3) : recette nette, billets vendus et événements en vente sur 30 jours, avec la
 * période précédente pour l'évolution, et le nombre de brouillons.
 */
export async function homeKpis(ctx: OrgContext, now = new Date()) {
  const organizationId = ctx.organization.id;
  const day = 86_400_000;
  const since = new Date(now.getTime() - 30 * day);
  const before = new Date(now.getTime() - 60 * day);
  const paid = (from: Date, to: Date) =>
    db.order.aggregate({
      where: {
        organizationId,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        paidAt: { gte: from, lt: to },
      },
      _sum: {
        totalMinor: true,
        applicationFeeMinor: true,
        paymentFeeMinor: true,
        refundedMinor: true,
      },
    });
  const tickets = (from: Date, to: Date) =>
    db.ticket.count({
      where: {
        event: { organizationId },
        status: { in: ["VALID", "CHECKED_IN"] },
        createdAt: { gte: from, lt: to },
      },
    });
  const [events, drafts, now30, prev30, t30, tPrev] = await Promise.all([
    db.event.count({
      where: {
        organizationId,
        status: { in: ["PUBLISHED", "SALES_PAUSED"] },
        deletedAt: null,
      },
    }),
    db.event.count({
      where: { organizationId, status: "DRAFT", deletedAt: null },
    }),
    paid(since, now),
    paid(before, since),
    tickets(since, now),
    tickets(before, since),
  ]);
  const net = netOfSums(now30._sum);
  return {
    events,
    drafts,
    netMinor: net,
    netDeltaMinor: net - netOfSums(prev30._sum),
    tickets: t30,
    ticketsDelta: t30 - tPrev,
  };
}
