import "server-only";
import { db } from "@/lib/db";

const DAY = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Section 11 : sessions et jetons expirés supprimés, invitations expirées marquées, redirections d'adresse échues retirées. */
export async function purgeExpiredTokens(now = new Date()) {
  const [sessions, verifications, invitations, redirects] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.invitation.updateMany({ where: { status: "PENDING", expiresAt: { lt: now } }, data: { status: "EXPIRED" } }),
    db.hostRedirect.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { sessions: sessions.count, verifications: verifications.count, invitations: invitations.count, redirects: redirects.count };
}

/** Section 11 : agrégats quotidiens par événement (EventDailyStat), recalculés pour la veille et le jour même, en UTC. */
export async function aggregateDailyStats(now = new Date()) {
  const since = new Date(utcDay(now).getTime() - DAY);
  const [orders, refunds, resales, checkIns] = await Promise.all([
    db.order.findMany({
      where: { paidAt: { gte: since }, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      select: { eventId: true, paidAt: true, totalMinor: true, applicationFeeMinor: true, _count: { select: { tickets: true } } },
    }),
    db.refund.findMany({
      where: { status: "SUCCEEDED", processedAt: { gte: since } },
      select: { amountMinor: true, processedAt: true, order: { select: { eventId: true } } },
    }),
    db.resaleListing.findMany({ where: { status: "SOLD", soldAt: { gte: since } }, select: { eventId: true, soldAt: true } }),
    db.ticket.findMany({ where: { checkedInAt: { gte: since } }, select: { eventId: true, checkedInAt: true } }),
  ]);
  type Row = { ticketsSold: number; grossMinor: number; feesMinor: number; refundsMinor: number; resalesCount: number; checkIns: number };
  const rows = new Map<string, Row>();
  const row = (eventId: string, at: Date) => {
    const key = `${eventId}|${utcDay(at).toISOString()}`;
    if (!rows.has(key)) rows.set(key, { ticketsSold: 0, grossMinor: 0, feesMinor: 0, refundsMinor: 0, resalesCount: 0, checkIns: 0 });
    return rows.get(key)!;
  };
  for (const o of orders) {
    const r = row(o.eventId, o.paidAt!);
    r.ticketsSold += o._count.tickets;
    r.grossMinor += o.totalMinor;
    r.feesMinor += o.applicationFeeMinor;
  }
  for (const f of refunds) row(f.order.eventId, f.processedAt!).refundsMinor += f.amountMinor;
  for (const l of resales) row(l.eventId, l.soldAt!).resalesCount++;
  for (const t of checkIns) row(t.eventId, t.checkedInAt!).checkIns++;
  for (const [key, data] of rows) {
    const [eventId, day] = key.split("|") as [string, string];
    const date = new Date(day);
    await db.eventDailyStat.upsert({ where: { eventId_date: { eventId, date } }, create: { eventId, date, ...data }, update: data });
  }
  return rows.size;
}
