import { describe, expect, it, vi } from "vitest";

// session, double authentification et cookies simulés : le back-office testé tel quel, sans navigateur
const state: { session: unknown; twofa: boolean } = { session: null, twofa: false };
const jar = new Map<string, string>();
vi.mock("@/server/session", () => ({ getSession: async () => state.session }));
vi.mock("@/server/twoFactor", async (original) => ({
  ...(await original<typeof import("@/server/twoFactor")>()),
  twoFactorSatisfied: async () => state.twofa,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
  headers: async () => new Headers(),
}));

const { db } = await import("@/lib/db");
const { finalizeOrder, reserveOrder } = await import("@/server/checkout");
const { currentStaff, platformDashboard, platformSearch, requireStaff, resendOrderEmail, startSupportView, stopSupportView, supportViewAllowed } =
  await import("@/server/platform");

const rid = () => Math.random().toString(36).slice(2, 10);
const login = (userId: string) => {
  state.session = { user: { id: userId }, session: { id: `s-${rid()}` } };
};
const org = (id: string) =>
  db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });

describe("back-office : équipe Evoly (section 9.24)", () => {
  it("reconnaissance : sans session ou sans rôle, rien ; double authentification exigée ; extérieur : introuvable", async () => {
    state.session = null;
    state.twofa = false;
    expect(await currentStaff()).toBeNull();
    await expect(requireStaff()).rejects.toThrow(); // introuvable
    const client = await db.user.create({ data: { name: "Client", email: `c.${rid()}@exemple.be`, emailVerified: true } });
    login(client.id);
    expect(await currentStaff()).toBeNull();
    const support = await db.user.create({
      data: { name: "Sam Support", email: `s.${rid()}@evoly.be`, emailVerified: true, platformRole: "SUPPORT", twoFactorEnabled: true },
    });
    login(support.id);
    expect(await currentStaff()).toMatchObject({ verified: false });
    await expect(requireStaff()).rejects.toThrow(); // renvoyé vers la double authentification
    state.twofa = true;
    expect(await currentStaff()).toMatchObject({ verified: true, user: { platformRole: "SUPPORT" } });
    await expect(requireStaff("ADMIN")).rejects.toThrow(); // le support ne peut pas agir comme administrateur
  });

  it("consultation support : limitée à l'organisation visée, tracée, cookie falsifié refusé, fermée", async () => {
    const id = rid();
    const o = await org(id);
    const autre = await org(`${id}b`);
    const support = await db.user.create({
      data: { name: "Sam Support", email: `s.${id}@evoly.be`, emailVerified: true, platformRole: "SUPPORT", twoFactorEnabled: true },
    });
    login(support.id);
    state.twofa = true;
    const st = (await currentStaff())!;
    expect(await startSupportView(st, o.id)).toBe(o.slug);
    expect(await db.auditLog.count({ where: { organizationId: o.id, action: "platform.support_view_started" } })).toBe(1);
    expect(await supportViewAllowed(o.slug)).toBe(true);
    expect(await supportViewAllowed(autre.slug)).toBe(false);
    for (const k of jar.keys()) jar.set(k, `${o.id}.${"0".repeat(64)}`);
    expect(await supportViewAllowed(o.slug)).toBe(false);
    await startSupportView(st, o.id);
    await stopSupportView();
    expect(await supportViewAllowed(o.slug)).toBe(false);
  });

  it("renvoi de l'e-mail d'une commande, tracé ; recherche et tableau de bord", async () => {
    const id = rid();
    const o = await org(id);
    const event = await db.event.create({
      data: {
        organizationId: o.id,
        slug: `gala-${id}`,
        publicCode: id.toUpperCase().slice(0, 8),
        title: `Gala ${id}`,
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 20 * 86_400_000),
        status: "PUBLISHED",
        ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 10 } },
      },
      include: { ticketTypes: true },
    });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    const email = `client.${id}@exemple.be`;
    await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: email, buyerFirstName: "Alex", buyerLastName: "Martin" } });
    await finalizeOrder(r.orderId);
    const admin = await db.user.create({
      data: { name: "Ada Admin", email: `a.${id}@evoly.be`, emailVerified: true, platformRole: "ADMIN", twoFactorEnabled: true },
    });
    login(admin.id);
    state.twofa = true;
    const st = (await currentStaff())!;
    const avant = await db.emailMessage.count({ where: { toEmail: email } });
    await resendOrderEmail(st, r.orderId);
    expect(await db.emailMessage.count({ where: { toEmail: email } })).toBeGreaterThan(avant);
    expect(await db.auditLog.count({ where: { organizationId: o.id, action: "platform.order_email_resent" } })).toBe(1);
    expect(JSON.stringify(await platformSearch(`club-${id}`))).toContain(o.slug);
    expect(await platformDashboard()).toBeTruthy();
  });
});
