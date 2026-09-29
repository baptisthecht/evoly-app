import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { markRead, notify, notifyNewOrder, notifySalesMilestone, unreadCount } from "@/server/notifications";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const roles = Object.fromEntries(await Promise.all(["OWNER", "ADMIN", "SCANNER"].map(async (k) => [k, (await db.role.findFirstOrThrow({ where: { systemKey: k as "OWNER" } })).id])));
  const users: Record<string, string> = {};
  for (const k of ["OWNER", "ADMIN", "SCANNER"]) {
    const u = await db.user.create({ data: { name: k, email: `${k.toLowerCase()}.${id}@exemple.be`, emailVerified: true } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: u.id, roleId: roles[k]! } });
    users[k] = u.id;
  }
  return { id, org, users };
}

describe("notifications (section 9.20, RG-NTF-01, RG-NTF-02)", () => {
  it("visibles des seuls membres autorisés ; les importantes partent aussi par e-mail au propriétaire et aux administrateurs", async () => {
    const s = await setup();
    await notify(s.org.id, "REFUND_REQUESTED", { title: "Gala", body: "Demande de remboursement", link: "/orders/x" });
    expect(await unreadCount(s.org.id, s.users.OWNER!)).toBe(1);
    expect(await unreadCount(s.org.id, s.users.ADMIN!)).toBe(1);
    expect(await unreadCount(s.org.id, s.users.SCANNER!)).toBe(0);
    expect((await db.emailMessage.findMany({ where: { organizationId: s.org.id, template: "notification.refund_requested" }, select: { toEmail: true } })).map((m) => m.toEmail).sort()).toEqual([`admin.${s.id}@exemple.be`, `owner.${s.id}@exemple.be`]);
    await notify(s.org.id, "CAMPAIGN_SENT", { title: "Printemps", body: "Envoyée" });
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "notification.campaign_sent" } })).toBe(0);
  });

  it("« lu » propre à chaque membre ; nouvelles commandes regroupées au-delà de 10 par heure", async () => {
    const s = await setup();
    const now = new Date("2026-11-02T15:20:00Z");
    for (let i = 0; i < 12; i++) await notifyNewOrder(s.org.id, { id: `o${i}`, reference: `EVO-${i}`, eventTitle: "Gala", tickets: 1 }, new Date(now.getTime() + i * 60_000));
    const rows = await db.notification.findMany({ where: { organizationId: s.org.id, userId: s.users.OWNER, type: "NEW_ORDER" } });
    expect(rows).toHaveLength(11);
    expect(rows.find((r) => r.link?.startsWith("/orders?heure="))?.title).toBe("2 autres commandes cette heure-ci");
    await markRead(s.org.id, s.users.OWNER!);
    expect(await unreadCount(s.org.id, s.users.OWNER!)).toBe(0);
    expect(await unreadCount(s.org.id, s.users.ADMIN!)).toBe(11);
  });

  it("paliers de jauge : 50 %, 80 %, complet, chacun une seule fois", async () => {
    const s = await setup();
    const e = await db.event.create({ data: { organizationId: s.org.id, slug: `gala-${s.id}`, publicCode: s.id.toUpperCase().slice(0, 8), title: `Gala ${s.id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 5 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 10, quantitySold: 5 } } }, include: { ticketTypes: true } });
    await notifySalesMilestone(e.id);
    await notifySalesMilestone(e.id);
    await db.ticketType.update({ where: { id: e.ticketTypes[0]!.id }, data: { quantitySold: 10 } });
    await notifySalesMilestone(e.id);
    const bodies = (await db.notification.findMany({ where: { organizationId: s.org.id, userId: s.users.OWNER, type: "SALES_MILESTONE" }, orderBy: { createdAt: "asc" } })).map((n) => n.body);
    expect(bodies).toEqual(["50 % de la jauge atteints.", "Complet : toutes les places sont vendues."]);
  });
});
