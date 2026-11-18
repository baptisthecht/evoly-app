import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { safeError } from "@/lib/redact";
import { saveMollieAuthorization } from "@/server/mollieAccounts";
import { notifyFailedSettlements } from "@/server/mollieFinances";
import {
  notificationPreferences,
  notify,
  saveNotificationPreferences,
  unreadCount,
} from "@/server/notifications";

const rid = () => Math.random().toString(36).slice(2, 10);
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  const users: Record<string, string> = {};
  for (const k of ["OWNER", "ADMIN", "SCANNER"]) {
    const role = await db.role.findFirstOrThrow({
      where: { systemKey: k as "OWNER" },
    });
    const u = await db.user.create({
      data: {
        name: k,
        email: `${k.toLowerCase()}.${id}@exemple.be`,
        emailVerified: true,
      },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: u.id, roleId: role.id },
    });
    users[k] = u.id;
  }
  return { id, org, users };
}

describe("virements, préférences de notification et journaux (sections 9.20, 11 et 12, RG-RGPD-03)", () => {
  it("journaux : adresses e-mail et numéros masqués", () => {
    const msg = safeError(
      new Error("Échec de l'envoi à lea@exemple.be (+32 470 12 34 56)"),
    );
    expect(msg).not.toContain("lea@exemple.be");
    expect(msg).toContain("[e-mail]");
    expect(msg).toContain("[numéro]");
  });

  it("virement échoué chez Mollie : notifié à qui voit les finances, et par e-mail au propriétaire et aux administrateurs ; virement réussi : rien", async () => {
    // seuls les comptes de ce test comptent
    await db.mollieAccount.updateMany({
      where: { disconnectedAt: null },
      data: { disconnectedAt: new Date() },
    });
    const s = await setup();
    const account = await saveMollieAuthorization({
      organizationId: s.org.id,
      mollieOrganizationId: `org_${s.id}`,
      tokens: {
        access_token: "access_mollie",
        refresh_token: "refresh_mollie",
        expires_in: 3600,
        token_type: "bearer",
        scope: "balances.read settlements.read",
      },
      testmode: false,
    });
    await db.mollieAccount.update({
      where: { id: account.id },
      data: { canReceiveSettlements: true },
    });
    // derniers versements du compte chez Mollie : un réussi, un échoué
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        if (url.pathname !== "/v2/settlements")
          return new Response(
            JSON.stringify({
              status: 404,
              title: "Not Found",
              detail: url.pathname,
            }),
            { status: 404 },
          );
        return new Response(
          JSON.stringify({
            count: 2,
            _embedded: {
              settlements: [
                {
                  id: `stl_ok_${s.id}`,
                  status: "paidout",
                  amount: { currency: "EUR", value: "1.00" },
                  createdAt: "2026-11-10T10:00:00Z",
                },
                {
                  id: `stl_ko_${s.id}`,
                  status: "failed",
                  amount: { currency: "EUR", value: "123.45" },
                  createdAt: "2026-11-18T10:00:00Z",
                },
              ],
            },
            _links: { next: null },
          }),
        );
      }),
    );
    expect(await notifyFailedSettlements()).toBe(1);
    expect(await unreadCount(s.org.id, s.users.OWNER!)).toBe(1);
    expect(await unreadCount(s.org.id, s.users.ADMIN!)).toBe(1);
    expect(await unreadCount(s.org.id, s.users.SCANNER!)).toBe(0);
    const n = await db.notification.findFirstOrThrow({
      where: { organizationId: s.org.id, type: "PAYOUT_FAILED" },
    });
    expect(n.body).toContain("123,45");
    expect(
      await db.emailMessage.count({
        where: {
          organizationId: s.org.id,
          template: "notification.payout_failed",
        },
      }),
    ).toBe(2);
  });

  it("préférences : un type coupé dans l'app n'est plus créé, un e-mail coupé n'est plus envoyé", async () => {
    const s = await setup();
    await saveNotificationPreferences(
      s.org.id,
      s.users.ADMIN!,
      ["DISPUTE_OPENED"],
      [],
    );
    await saveNotificationPreferences(
      s.org.id,
      s.users.OWNER!,
      [],
      ["DISPUTE_OPENED"],
    );
    await notify(s.org.id, "DISPUTE_OPENED", {
      title: "Litige",
      body: "Un paiement est contesté",
    });
    expect(await unreadCount(s.org.id, s.users.ADMIN!)).toBe(0);
    expect(await unreadCount(s.org.id, s.users.OWNER!)).toBe(1);
    expect(
      (
        await db.emailMessage.findMany({
          where: {
            organizationId: s.org.id,
            template: "notification.dispute_opened",
          },
          select: { toEmail: true },
        })
      ).map((m) => m.toEmail),
    ).toEqual([`admin.${s.id}@exemple.be`]);
    const prefs = await notificationPreferences(s.org.id, s.users.OWNER!);
    expect(prefs!.find((p) => p.type === "DISPUTE_OPENED")).toEqual({
      type: "DISPUTE_OPENED",
      inApp: true,
      email: false,
    });
    expect(prefs!.find((p) => p.type === "NEW_ORDER")!.email).toBeNull();
    expect(
      (await notificationPreferences(s.org.id, s.users.SCANNER!))!.some(
        (p) => p.type === "PAYOUT_FAILED",
      ),
    ).toBe(false);
  });
});
