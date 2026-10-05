import { describe, expect, it } from "vitest";
import { effectivePlan } from "@evoly/core";
import { db } from "@/lib/db";
import { reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import {
  assignPlan,
  decryptSecret,
  encryptSecret,
  extendTrial,
  featureEnabled,
  organizationSheet,
  reactivateOrganization,
  setFeatureFlag,
  suspendOrganization,
  totpFor,
  type Staff,
} from "@/server/platform";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(price = 2000) {
  const id = rid();
  const [owner, admin] = await Promise.all(
    ["own", "adm"].map((p) =>
      db.user.create({
        data: {
          name: `${p} ${id}`,
          email: `${p}.${id}@exemple.be`,
          emailVerified: true,
          ...(p === "adm" ? { platformRole: "ADMIN" as const, twoFactorEnabled: true } : {}),
        },
      }),
    ),
  );
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  await db.organizationMember.create({
    data: { organizationId: org.id, userId: owner!.id, roleId: (await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } })).id },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 5 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: price, currency: "EUR", quantity: 50 } },
    },
    include: { ticketTypes: true },
  });
  const st = {
    user: { id: admin!.id, email: admin!.email, name: admin!.name, platformRole: "ADMIN", twoFactorEnabled: true },
    sessionId: "s",
    verified: true,
  } as unknown as Staff;
  return { id, org, owner: owner!, event, st };
}
const sub = (organizationId: string) => db.subscription.findUnique({ where: { organizationId } });

describe("back-office Evoly (section 9.24)", () => {
  it("double authentification : secret chiffré, code TOTP vérifié", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const blob = encryptSecret(secret);
    expect(blob).not.toContain(secret);
    expect(decryptSecret(blob)).toBe(secret);
    const totp = totpFor(secret, "support@evoly.me");
    expect(totp.validate({ token: totp.generate(), window: 1 })).not.toBeNull();
    expect(totp.validate({ token: "000000", window: 0 }) === 0).toBe(false);
  });

  it("suspension : ventes refusées, membres en lecture seule, puis réactivation", async () => {
    const s = await setup();
    await suspendOrganization(s.st, s.org.id, "Soupçon de fraude au paiement");
    await expect(reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" })).rejects.toThrow(
      "SALES_SUSPENDED",
    );
    const ctx = await findOrgContext(s.owner.id, s.org.slug);
    expect(ctx).toMatchObject({ readOnly: true, suspended: true });
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "platform.suspended" } })).toBe(1);
    expect(await db.auditLog.count({ where: { organizationId: s.org.id, action: "platform.organization_suspended", actorType: "ADMIN" } })).toBe(1);
    await reactivateOrganization(s.st, s.org.id);
    await expect(reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" })).resolves.toBeTruthy();
  });

  it("essai prolongé, offre attribuée jusqu'à une date, refus si l'abonnement est géré par Stripe", async () => {
    const s = await setup();
    await extendTrial(s.st, s.org.id, 10);
    const first = (await sub(s.org.id))!;
    expect(first).toMatchObject({ planId: "pro", status: "TRIALING" });
    await extendTrial(s.st, s.org.id, 5);
    expect((await sub(s.org.id))!.trialEndsAt!.getTime() - first.trialEndsAt!.getTime()).toBe(5 * 86_400_000);
    const until = new Date(Date.now() + 20 * 86_400_000);
    await assignPlan(s.st, s.org.id, "pro", until);
    const assigned = (await sub(s.org.id))!;
    expect(effectivePlan(assigned, new Date())).toBe("pro");
    expect(effectivePlan(assigned, new Date(until.getTime() + 60_000))).toBe("free");
    await db.subscription.update({ where: { organizationId: s.org.id }, data: { stripeSubscriptionId: `sub_${s.id}`, status: "ACTIVE" } });
    await expect(assignPlan(s.st, s.org.id, "free", null)).rejects.toThrow("PLAN_MANAGED_BY_STRIPE");
  });

  it("fonctionnalités par organisation ou globales ; signal de risque ; consultation support en lecture seule", async () => {
    const s = await setup(20_000);
    const key = `essai_${s.id}`;
    await setFeatureFlag(s.st, key, null, true);
    expect(await featureEnabled(key, s.org.id)).toBe(true);
    await setFeatureFlag(s.st, key, s.org.id, false);
    expect(await featureEnabled(key, s.org.id)).toBe(false);
    expect((await organizationSheet(s.org.id))?.risks).toContain("NEW_ORG_HIGH_PRICE");
    const view = await findOrgContext(s.st.user.id, s.org.slug, { supportView: true });
    expect(view).toMatchObject({ readOnly: true, supportView: true });
    expect(await findOrgContext(s.st.user.id, s.org.slug)).toBeNull(); // hors consultation : pas membre, aucune action possible
  });
});
