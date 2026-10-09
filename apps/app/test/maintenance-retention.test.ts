import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { latePaymentRefundEmail } from "@/server/email/templates";
import { aggregateDailyStats, purgeExpiredTokens } from "@/server/maintenance";
import { applyRetention } from "@/server/retention";

const rid = () => Math.random().toString(36).slice(2, 10);
const ago = (ms: number) => new Date(Date.now() - ms);
const DAY = 86_400_000;

async function setup() {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * DAY),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50, sortOrder: 0 }] },
    },
    include: { ticketTypes: true },
  });
  const buy = async (email: string) => {
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email, marketingOptIn: false });
    return r.orderId;
  };
  return { id, org, event, buy };
}

describe("tâches planifiées de maintenance et de conservation (section 11, RG-RGPD-02)", () => {
  it("jetons, invitations et redirections expirés", async () => {
    const s = await setup();
    const owner = await db.user.create({ data: { name: "Propriétaire", email: `p.${s.id}@exemple.be`, emailVerified: true } });
    const role = await db.role.findFirstOrThrow({ where: { systemKey: "ADMIN" } });
    await db.verification.create({ data: { identifier: `v-${s.id}`, value: "x", expiresAt: ago(60_000) } });
    const inv = await db.invitation.create({
      data: { organizationId: s.org.id, email: `i.${s.id}@exemple.be`, roleId: role.id, tokenHash: `h-${s.id}`, expiresAt: ago(60_000), invitedById: owner.id },
    });
    await db.hostRedirect.create({ data: { host: `ancien-${s.id}.evoly.me`, organizationId: s.org.id, expiresAt: ago(60_000) } });
    await purgeExpiredTokens();
    expect(await db.verification.count({ where: { identifier: `v-${s.id}` } })).toBe(0);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("EXPIRED");
    expect(await db.hostRedirect.count({ where: { host: `ancien-${s.id}.evoly.me` } })).toBe(0);
  });

  it("agrégats quotidiens : billets vendus et entrées du jour", async () => {
    const s = await setup();
    const orderId = await s.buy(`lea.${s.id}@exemple.be`);
    await db.ticket.updateMany({ where: { orderId }, data: { checkedInAt: new Date() } });
    await aggregateDailyStats();
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const row = await db.eventDailyStat.findUniqueOrThrow({ where: { eventId_date: { eventId: s.event.id, date: today } } });
    expect(row.ticketsSold).toBe(1);
    expect(row.checkIns).toBe(1);
  });

  it("conservation : commandes de plus de 7 ans anonymisées, journaux d'envoi après 12 mois, audit supprimé après 12 mois", async () => {
    const s = await setup();
    const oldId = await s.buy(`ancien.${s.id}@exemple.be`);
    const recentId = await s.buy(`recent.${s.id}@exemple.be`);
    await db.order.update({ where: { id: oldId }, data: { createdAt: ago(8 * 366 * DAY) } });
    const mail = await db.emailMessage.create({
      data: {
        organizationId: s.org.id,
        category: "SERVICE",
        template: "order.confirmation",
        toEmail: `vieux.${s.id}@exemple.be`,
        subject: "Billets",
        queuedAt: ago(400 * DAY),
      },
    });
    await db.auditLog.create({ data: { organizationId: s.org.id, actorType: "SYSTEM", action: "test.ancien", createdAt: ago(400 * DAY) } });
    await applyRetention();
    const old = await db.order.findUniqueOrThrow({ where: { id: oldId } });
    expect(old.buyerEmail).toBe(`anonyme+${oldId}@evoly.invalid`);
    expect(old.buyerFirstName).toBe("Anonyme");
    expect((await db.order.findUniqueOrThrow({ where: { id: recentId } })).buyerEmail).toBe(`recent.${s.id}@exemple.be`);
    expect((await db.emailMessage.findUniqueOrThrow({ where: { id: mail.id } })).toEmail).toBe("anonyme@evoly.invalid");
    expect(await db.auditLog.count({ where: { organizationId: s.org.id, action: "test.ancien" } })).toBe(0);
  });

  it("e-mail de paiement tardif remboursé, dans la langue de l'acheteur", () => {
    const fr = latePaymentRefundEmail({ locale: "fr", organizationName: "Club", eventTitle: "Gala", amount: "24,00 €" });
    expect(fr.subject).toBe("Gala : votre paiement est remboursé");
    expect(fr.text).toContain("24,00 €");
    expect(latePaymentRefundEmail({ locale: "nl", organizationName: "Club", eventTitle: "Gala", amount: "€ 24,00" }).subject).toBe(
      "Gala: je betaling is terugbetaald",
    );
  });
});
