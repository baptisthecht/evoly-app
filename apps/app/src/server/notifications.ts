import "server-only";
import { can, eventCapacity, type Permission } from "@evoly/core";
import type { NotificationType } from "@evoly/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "./email/send";

/** RG-NTF-01 : permission requise pour voir chaque type de notification. */
const PERMISSION: Record<NotificationType, Permission> = {
  NEW_ORDER: "ORDERS_VIEW",
  SALES_MILESTONE: "ORDERS_VIEW",
  REFUND_REQUESTED: "REFUNDS_MANAGE",
  RESALE_SOLD: "ORDERS_VIEW",
  MEMBER_JOINED: "MEMBERS_MANAGE",
  STRIPE_ACTION_REQUIRED: "PAYMENTS_MANAGE",
  SUBSCRIPTION_PAYMENT_FAILED: "BILLING_MANAGE",
  TRIAL_ENDING: "BILLING_MANAGE",
  DOMAIN_ACTIVE: "DOMAINS_MANAGE",
  DOMAIN_ERROR: "DOMAINS_MANAGE",
  EVENT_CANCELLED: "ORDERS_VIEW",
  CAMPAIGN_SENT: "MARKETING_MANAGE",
  DISPUTE_OPENED: "FINANCE_VIEW",
};
/** RG-NTF-02 : notifications importantes, aussi envoyées par e-mail au propriétaire et aux administrateurs. */
const IMPORTANT = new Set<NotificationType>(["STRIPE_ACTION_REQUIRED", "SUBSCRIPTION_PAYMENT_FAILED", "DISPUTE_OPENED", "REFUND_REQUESTED"]);

async function recipients(organizationId: string, type: NotificationType) {
  const members = await db.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { role: true, user: { select: { id: true, email: true, name: true } } },
  });
  return members.filter((m) => can({ status: m.status, systemRole: m.role.systemKey as never, permissions: m.role.permissions }, PERMISSION[type]));
}

/**
 * Notification dans l'app (section 9.20) : un exemplaire par membre autorisé, pour un état « lu » propre à chacun.
 * `email: false` quand un e-mail dédié part déjà (abonnement, par exemple).
 */
export async function notify(
  organizationId: string,
  type: NotificationType,
  content: { title: string; body: string; link?: string | null },
  opts: { email?: boolean } = {},
) {
  try {
    const members = await recipients(organizationId, type);
    if (members.length === 0) return;
    await db.notification.createMany({
      data: members.map((m) => ({
        organizationId,
        userId: m.user.id,
        type,
        title: content.title.slice(0, 200),
        body: content.body.slice(0, 500),
        link: content.link ?? null,
      })),
    });
    if (IMPORTANT.has(type) && opts.email !== false) {
      const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, slug: true } });
      const url = `${env().NEXT_PUBLIC_APP_URL}/o/${org.slug}${content.link ?? "/notifications"}`;
      for (const m of members.filter((x) => x.role.systemKey === "OWNER" || x.role.systemKey === "ADMIN"))
        await sendEmail({
          to: m.user.email,
          template: `notification.${type.toLowerCase()}`,
          category: "SERVICE",
          organizationId,
          subject: `${org.name} : ${content.title}`,
          text: `${content.body}\n\n${url}\n\nEvoly`,
          html: `<p>${content.body.replace(/</g, "&lt;")}</p><p><a href="${url}">${url}</a></p><p>Evoly</p>`,
        }).catch(() => undefined);
    }
  } catch (err) {
    console.error("notification non créée", type, err instanceof Error ? err.message : "erreur");
  }
}

/** Nouvelle commande : individuelle jusqu'à 10 par heure, puis regroupée (section 9.20). */
export async function notifyNewOrder(organizationId: string, order: { id: string; reference: string; eventTitle: string; tickets: number }, now = new Date()) {
  const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const groupLink = `/orders?heure=${hour.toISOString().slice(0, 13)}`;
  const members = await recipients(organizationId, "NEW_ORDER");
  if (members.length === 0) return;
  const probe = members[0]!.user.id;
  const thisHour = await db.notification.count({ where: { organizationId, userId: probe, type: "NEW_ORDER", createdAt: { gte: hour } } });
  if (thisHour < 10) {
    // horodatée à l'heure de référence du regroupement (et non à l'heure du serveur)
    await db.notification.createMany({
      data: members.map((m) => ({
        organizationId,
        userId: m.user.id,
        type: "NEW_ORDER" as const,
        title: order.eventTitle.slice(0, 200),
        body: `${order.reference} · ${order.tickets} billet${order.tickets > 1 ? "s" : ""}`,
        link: `/orders/${order.id}`,
        createdAt: now,
      })),
    });
    return;
  }
  // au-delà : une notification groupée par heure, mise à jour à chaque commande
  const grouped = await db.notification.findFirst({ where: { organizationId, userId: probe, type: "NEW_ORDER", link: groupLink } });
  const count = grouped ? Number(/^(\d+)/.exec(grouped.title)?.[1] ?? 0) + 1 : 1;
  const title = `${count} autre${count > 1 ? "s" : ""} commande${count > 1 ? "s" : ""} cette heure-ci`;
  if (grouped)
    await db.notification.updateMany({
      where: { organizationId, type: "NEW_ORDER", link: groupLink },
      data: { title, body: order.eventTitle, readAt: null, createdAt: now },
    });
  else
    await db.notification.createMany({
      data: members.map((m) => ({
        organizationId,
        userId: m.user.id,
        type: "NEW_ORDER" as const,
        title,
        body: order.eventTitle,
        link: groupLink,
        createdAt: now,
      })),
    });
}

/** Paliers de jauge : 50 %, 80 % et complet, chacun signalé une seule fois. */
export async function notifySalesMilestone(eventId: string) {
  const e = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, organizationId: true, capacity: true, ticketTypes: { select: { quantity: true, quantitySold: true } } },
  });
  if (!e) return;
  const capacity = eventCapacity(
    e.capacity,
    e.ticketTypes.map((t) => t.quantity),
  );
  if (!capacity) return;
  const ratio = e.ticketTypes.reduce((n, t) => n + t.quantitySold, 0) / capacity;
  const reached = [100, 80, 50].find((p) => ratio >= p / 100);
  if (!reached) return;
  const link = `/events/${e.id}?palier=${reached}`;
  if (await db.notification.findFirst({ where: { organizationId: e.organizationId, type: "SALES_MILESTONE", link }, select: { id: true } })) return;
  await notify(e.organizationId, "SALES_MILESTONE", {
    title: e.title,
    body: reached === 100 ? "Complet : toutes les places sont vendues." : `${reached} % de la jauge atteints.`,
    link,
  });
}

/** Cloche : non lues de la personne connectée. */
export const unreadCount = (organizationId: string, userId: string) => db.notification.count({ where: { organizationId, userId, readAt: null } });

export async function listNotifications(organizationId: string, userId: string, page = 0) {
  const where = { organizationId, userId };
  const [rows, total] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 30, skip: page * 30 }),
    db.notification.count({ where }),
  ]);
  return { rows, pages: Math.ceil(total / 30) };
}

export async function markRead(organizationId: string, userId: string, id?: string) {
  await db.notification.updateMany({ where: { organizationId, userId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
}

/** Alerte au support d'Evoly : remboursement du vendeur d'une revente impossible (section 9.13). */
export async function alertSupport(subject: string, text: string) {
  const to = env().SUPPORT_EMAIL;
  if (!to) return;
  await sendEmail({
    to,
    template: "support.alert",
    category: "SERVICE",
    subject: `[Alerte] ${subject}`,
    text,
    html: `<pre style="font-family:monospace">${text.replace(/</g, "&lt;")}</pre>`,
  }).catch(() => undefined);
}
