import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { safeError } from "@/lib/redact";
import { reserveOrder } from "@/server/checkout";
import { notificationPreferences, notify, saveNotificationPreferences, unreadCount } from "@/server/notifications";
import { handleConnectEvent } from "@/server/stripeConnectEvents";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const users: Record<string, string> = {};
  for (const k of ["OWNER", "ADMIN", "SCANNER"]) {
    const role = await db.role.findFirstOrThrow({ where: { systemKey: k as "OWNER" } });
    const u = await db.user.create({ data: { name: k, email: `${k.toLowerCase()}.${id}@exemple.be`, emailVerified: true } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: u.id, roleId: role.id } });
    users[k] = u.id;
  }
  const account = `acct_${id}`;
  await db.stripeAccount.create({ data: { organizationId: org.id, stripeAccountId: account, country: "BE", defaultCurrency: "EUR" } });
  return { id, org, users, account };
}
const event = (type: string, object: object, account?: string) => ({ id: `evt_${rid()}`, type, account, data: { object } }) as unknown as Stripe.Event;

describe("virements, paiements annulés, préférences de notification et journaux (sections 9.20, 11 et 12, RG-RGPD-03)", () => {
  it("journaux : adresses e-mail et numéros masqués", () => {
    const msg = safeError(new Error("Échec de l'envoi à lea@exemple.be (+32 470 12 34 56)"));
    expect(msg).not.toContain("lea@exemple.be");
    expect(msg).toContain("[e-mail]");
    expect(msg).toContain("[numéro]");
  });

  it("virement échoué : notifié à qui voit les finances, et par e-mail au propriétaire et aux administrateurs", async () => {
    const s = await setup();
    expect(await handleConnectEvent(event("payout.failed", { amount: 12345, currency: "eur", failure_message: "Compte fermé" }, s.account))).toBe("PROCESSED");
    expect(await unreadCount(s.org.id, s.users.OWNER!)).toBe(1);
    expect(await unreadCount(s.org.id, s.users.ADMIN!)).toBe(1);
    expect(await unreadCount(s.org.id, s.users.SCANNER!)).toBe(0);
    const n = await db.notification.findFirstOrThrow({ where: { organizationId: s.org.id, type: "PAYOUT_FAILED" } });
    expect(n.body).toContain("123,45 EUR");
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "notification.payout_failed" } })).toBe(2);
    expect(await handleConnectEvent(event("payout.paid", { amount: 100, currency: "eur" }, s.account))).toBe("PROCESSED");
  });

  it("préférences : un type coupé dans l'app n'est plus créé, un e-mail coupé n'est plus envoyé", async () => {
    const s = await setup();
    await saveNotificationPreferences(s.org.id, s.users.ADMIN!, ["DISPUTE_OPENED"], []);
    await saveNotificationPreferences(s.org.id, s.users.OWNER!, [], ["DISPUTE_OPENED"]);
    await notify(s.org.id, "DISPUTE_OPENED", { title: "Litige", body: "Un paiement est contesté" });
    expect(await unreadCount(s.org.id, s.users.ADMIN!)).toBe(0);
    expect(await unreadCount(s.org.id, s.users.OWNER!)).toBe(1);
    expect(
      (await db.emailMessage.findMany({ where: { organizationId: s.org.id, template: "notification.dispute_opened" }, select: { toEmail: true } })).map(
        (m) => m.toEmail,
      ),
    ).toEqual([`admin.${s.id}@exemple.be`]);
    const prefs = await notificationPreferences(s.org.id, s.users.OWNER!);
    expect(prefs!.find((p) => p.type === "DISPUTE_OPENED")).toEqual({ type: "DISPUTE_OPENED", inApp: true, email: false });
    expect(prefs!.find((p) => p.type === "NEW_ORDER")!.email).toBeNull();
    expect((await notificationPreferences(s.org.id, s.users.SCANNER!))!.some((p) => p.type === "PAYOUT_FAILED")).toBe(false);
  });

  it("paiement annulé : la réservation est libérée aussitôt", async () => {
    const s = await setup();
    const ev = await db.event.create({
      data: {
        organizationId: s.org.id,
        slug: `gala-${s.id}`,
        publicCode: s.id.toUpperCase().slice(0, 8),
        title: "Gala",
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 30 * 86_400_000),
        status: "PUBLISHED",
        visibility: "PUBLIC",
        ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 10, sortOrder: 0 }] },
      },
      include: { ticketTypes: true },
    });
    const r = await reserveOrder({ eventId: ev.id, lines: [{ ticketTypeId: ev.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    expect(await handleConnectEvent(event("payment_intent.canceled", { metadata: { orderId: r.orderId } }, s.account))).toBe("PROCESSED");
    const o = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(o.holdExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
