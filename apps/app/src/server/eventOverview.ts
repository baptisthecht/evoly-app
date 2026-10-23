import { db } from "@/lib/db";

const PAID = ["PAID", "PARTIALLY_REFUNDED"] as const;
export type SalesPeriod = "7" | "14" | "all";
export const parsePeriod = (v: string | undefined): SalesPeriod =>
  v === "7" || v === "all" ? v : "14";

/** Jour local (AAAA-MM-JJ) dans le fuseau de l'événement. */
const localDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/**
 * Chiffres de la vue d'ensemble d'un événement (maquette validée) : recette nette et sa semaine, billets vendus sur la
 * capacité, commandes et panier moyen, reventes en cours, ventes par jour, dernières commandes.
 */
export async function eventOverview(
  eventId: string,
  timeZone: string,
  period: SalesPeriod,
  now = new Date(),
) {
  const paid = { eventId, status: { in: [...PAID] } };
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const [
    withNet,
    withoutNet,
    weekWithNet,
    weekWithoutNet,
    tickets,
    resaleActive,
    recent,
    first,
    views,
  ] = await Promise.all([
    db.order.aggregate({
      where: { ...paid, netMinor: { not: null } },
      _sum: { netMinor: true, totalMinor: true },
      _count: true,
    }),
    db.order.aggregate({
      where: { ...paid, netMinor: null },
      _sum: { totalMinor: true },
      _count: true,
    }),
    db.order.aggregate({
      where: { ...paid, netMinor: { not: null }, paidAt: { gte: week } },
      _sum: { netMinor: true },
    }),
    db.order.aggregate({
      where: { ...paid, netMinor: null, paidAt: { gte: week } },
      _sum: { totalMinor: true },
    }),
    db.ticketType.findMany({
      where: { eventId },
      select: { quantity: true, quantitySold: true },
    }),
    db.resaleListing.count({ where: { eventId, status: "ACTIVE" } }),
    db.order.findMany({
      where: { eventId, status: { in: [...PAID, "REFUNDED"] } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        reference: true,
        buyerFirstName: true,
        buyerLastName: true,
        buyerEmail: true,
        totalMinor: true,
        currency: true,
        status: true,
        paidAt: true,
        createdAt: true,
        items: {
          select: { quantity: true, ticketType: { select: { name: true } } },
        },
      },
    }),
    db.order.findFirst({
      where: { ...paid, paidAt: { not: null } },
      orderBy: { paidAt: "asc" },
      select: { paidAt: true },
    }),
    db.eventDailyStat.aggregate({
      where: { eventId },
      _sum: { pageViews: true },
    }),
  ]);
  const ordersCount = withNet._count + withoutNet._count;
  const totalPaid =
    (withNet._sum.totalMinor ?? 0) + (withoutNet._sum.totalMinor ?? 0);
  const ticketsSold = tickets.reduce((n, t) => n + t.quantitySold, 0);
  const capacity =
    tickets.length && tickets.every((t) => t.quantity !== null)
      ? tickets.reduce((n, t) => n + (t.quantity ?? 0), 0)
      : null;
  // ventes par jour, dans le fuseau de l'événement : 7 ou 14 derniers jours, ou depuis la première vente (120 jours au plus)
  const today = localDay(now, timeZone);
  const span =
    period === "all"
      ? Math.min(
          120,
          Math.max(
            1,
            first?.paidAt
              ? Math.ceil(
                  (now.getTime() - first.paidAt.getTime()) / 86_400_000,
                ) + 1
              : 1,
          ),
        )
      : Number(period);
  const days: Array<{ day: string; tickets: number }> = [];
  for (let i = span - 1; i >= 0; i--)
    days.push({
      day: localDay(new Date(now.getTime() - i * 86_400_000), timeZone),
      tickets: 0,
    });
  const index = new Map(days.map((d, i) => [d.day, i]));
  const sales = await db.order.findMany({
    where: {
      ...paid,
      paidAt: { gte: new Date(now.getTime() - (span + 1) * 86_400_000) },
    },
    select: { paidAt: true, items: { select: { quantity: true } } },
  });
  for (const o of sales) {
    const i = o.paidAt ? index.get(localDay(o.paidAt, timeZone)) : undefined;
    if (i !== undefined)
      days[i]!.tickets += o.items.reduce((n, it) => n + it.quantity, 0);
  }
  return {
    netMinor: (withNet._sum.netMinor ?? 0) + (withoutNet._sum.totalMinor ?? 0),
    weekNetMinor:
      (weekWithNet._sum.netMinor ?? 0) + (weekWithoutNet._sum.totalMinor ?? 0),
    ticketsSold,
    capacity,
    ordersCount,
    averageBasketMinor: ordersCount ? Math.round(totalPaid / ordersCount) : 0,
    resaleActive,
    /** Visites de la billetterie (comptage anonyme) et part qui achète (commandes ÷ visites, 100 % au plus). */
    views: views._sum.pageViews ?? 0,
    conversionPct:
      (views._sum.pageViews ?? 0) > 0
        ? Math.min(
            100,
            Math.round((100 * ordersCount) / (views._sum.pageViews ?? 1)),
          )
        : null,
    days,
    today,
    recent: recent.map((o) => ({
      id: o.id,
      reference: o.reference,
      buyer:
        [o.buyerFirstName, o.buyerLastName].filter(Boolean).join(" ") ||
        o.buyerEmail,
      email: o.buyerEmail,
      totalMinor: o.totalMinor,
      currency: o.currency,
      status: o.status as "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED",
      at: o.paidAt ?? o.createdAt,
      lines: [
        ...o.items.reduce(
          (m, it) =>
            m.set(
              it.ticketType.name,
              (m.get(it.ticketType.name) ?? 0) + it.quantity,
            ),
          new Map<string, number>(),
        ),
      ]
        .map(([name, n]) => `${n} × ${name}`)
        .join(", "),
    })),
  };
}
