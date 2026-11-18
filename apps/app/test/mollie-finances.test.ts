import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.MOLLIE_CLIENT_ID = "app_essai_evoly";
process.env.MOLLIE_CLIENT_SECRET = "secret_essai_evoly";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));

const { db } = await import("@/lib/db");
const { createOrganization } = await import("@/server/onboarding");
const { finalizeOrder, reserveOrder } = await import("@/server/checkout");
const { saveMollieAuthorization } = await import("@/server/mollieAccounts");
const { syncPaymentFromMollie } = await import("@/server/molliePayments");
const { notifyFailedSettlements } = await import("@/server/mollieFinances");
const { paymentsOverview } = await import("@/server/finances");

type Route = { method: string; path: string; status?: number; body?: unknown };
const calls: Array<{ method: string; url: URL }> = [];

/** Mollie répond selon la méthode et le chemin ; chaque réponse ne sert qu'une fois, dans l'ordre donné. */
function mollie(...routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      calls.push({ method, url });
      const i = routes.findIndex(
        (r) => r.method === method && r.path === url.pathname,
      );
      if (i < 0)
        return new Response(
          JSON.stringify({
            status: 404,
            title: "Not Found",
            detail: url.pathname,
          }),
          { status: 404 },
        );
      const [r] = routes.splice(i, 1);
      return new Response(
        r!.body === undefined ? null : JSON.stringify(r!.body),
        {
          status: r!.status ?? 200,
        },
      );
    }),
  );
}
beforeEach(() => {
  calls.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

const rid = () => Math.random().toString(36).slice(2, 10);
const tokens = {
  access_token: "access_mollie",
  refresh_token: "refresh_mollie",
  expires_in: 3600,
  token_type: "bearer",
  scope: "balances.read settlements.read payments.read",
};
const list = <T>(key: string, items: T[]) => ({
  count: items.length,
  _embedded: { [key]: items },
  _links: { next: null },
});

/** Organisation (avec sa propriétaire, qui reçoit les notifications) au compte Mollie prêt. */
async function organizer() {
  const id = rid();
  const user = await db.user.create({
    data: { name: "Nora", email: `nora.${id}@exemple.be`, emailVerified: true },
  });
  const org = await createOrganization(user.id, {
    name: `Cercle ${id}`,
    subdomain: `cercle-${id}`,
    country: "BE",
    type: "ASSOCIATION",
  } as never);
  const account = await saveMollieAuthorization({
    organizationId: org.id,
    mollieOrganizationId: `org_${id}`,
    tokens,
    testmode: false,
  });
  await db.mollieAccount.update({
    where: { id: account.id },
    data: {
      profileId: `pfl_${id}`,
      profileStatus: "verified",
      methods: ["bancontact"],
      onboardingStatus: "COMPLETED",
      canReceivePayments: true,
      canReceiveSettlements: true,
    },
  });
  const ctx = {
    organization: { id: org.id, slug: org.slug, currency: "EUR" },
    user: { id: user.id },
  } as never;
  return { id, org, ctx, mollieOrganizationId: `org_${id}` };
}

describe("finances avec Mollie (docs/MOLLIE.md, lot 5)", () => {
  it("solde et derniers versements lus chez Mollie, statuts comme ceux de Stripe ; Mollie indisponible : rien d'inventé", async () => {
    const o = await organizer();
    mollie(
      {
        method: "GET",
        path: "/v2/balances/primary",
        body: {
          id: "bal_1",
          currency: "EUR",
          availableAmount: { currency: "EUR", value: "120.50" },
          pendingAmount: { currency: "EUR", value: "30.00" },
        },
      },
      {
        method: "GET",
        path: "/v2/settlements",
        body: list("settlements", [
          {
            id: "stl_1",
            status: "paidout",
            amount: { currency: "EUR", value: "80.00" },
            settledAt: "2026-11-10T10:00:00Z",
            createdAt: "2026-11-09T10:00:00Z",
          },
          {
            id: "stl_2",
            status: "processing-at-bank",
            amount: { currency: "EUR", value: "40.00" },
            createdAt: "2026-11-17T10:00:00Z",
          },
          {
            id: "stl_3",
            status: "failed",
            amount: { currency: "EUR", value: "15.00" },
            createdAt: "2026-11-18T10:00:00Z",
          },
        ]),
      },
    );
    const view = await paymentsOverview(o.ctx);
    expect(view).toMatchObject({
      connected: true,
      provider: "MOLLIE",
      ready: true,
      restricted: false,
      actionRequired: false,
      unavailable: false,
      dashboardUrl: "https://my.mollie.com/dashboard",
      balance: {
        available: [{ amount: 12050, currency: "EUR" }],
        pending: [{ amount: 3000, currency: "EUR" }],
      },
    });
    if (!view.connected) throw new Error("compte relié attendu");
    expect(view.payouts?.map((p) => [p.id, p.status, p.amount])).toEqual([
      ["stl_1", "paid", 8000],
      ["stl_2", "in_transit", 4000],
      ["stl_3", "failed", 1500],
    ]);
    // solde lu sans testmode : ressource commune aux deux modes
    expect(calls.every((c) => !c.url.searchParams.has("testmode"))).toBe(true);
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: "/v2/balances/primary",
      status: 503,
      body: { title: "Unavailable" },
    });
    expect(await paymentsOverview(o.ctx)).toMatchObject({
      connected: true,
      provider: "MOLLIE",
      unavailable: true,
      balance: null,
    });
  });

  it("sans compte : pas relié ; ancien compte Stripe seul : vu comme Stripe", async () => {
    const id = rid();
    const org = await db.organization.create({
      data: {
        name: `Club ${id}`,
        slug: `club-${id}`,
        country: "BE",
        currency: "EUR",
        timezone: "Europe/Brussels",
        locale: "fr",
      },
    });
    const ctx = { organization: { id: org.id, currency: "EUR" } } as never;
    expect(await paymentsOverview(ctx)).toEqual({
      connected: false,
      provider: null,
    });
    await db.stripeAccount.create({
      data: {
        organizationId: org.id,
        stripeAccountId: `acct_${id}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
      },
    });
    expect(await paymentsOverview(ctx)).toMatchObject({
      connected: true,
      provider: "STRIPE",
      ready: true,
      dashboardUrl: "https://dashboard.stripe.com/",
    });
  });

  it("rétrofacturation reçue sur un paiement : copiée comme litige, rattachée à la commande, signalée une fois ; annulée par Mollie : gagnée", async () => {
    const o = await organizer();
    const event = await db.event.create({
      data: {
        organizationId: o.org.id,
        slug: `gala-${o.id}`,
        publicCode: o.id.toUpperCase().slice(0, 8),
        title: `Gala ${o.id}`,
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 10 * 86_400_000),
        status: "PUBLISHED",
        ticketTypes: {
          create: {
            name: "Entrée",
            priceMinor: 2000,
            currency: "EUR",
            quantity: 50,
          },
        },
      },
      include: { ticketTypes: true },
    });
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }],
      locale: "fr",
    });
    const paymentId = `tr_${o.id}`;
    await db.order.update({
      where: { id: r.orderId },
      data: {
        buyerFirstName: "Léa",
        buyerLastName: "Martin",
        buyerEmail: `lea.${o.id}@exemple.be`,
        molliePaymentId: paymentId,
      },
    });
    await finalizeOrder(r.orderId, {
      molliePaymentId: paymentId,
      amountMinor: 2000,
      currency: "EUR",
      paymentMethodType: "creditcard",
    });
    const chargeback = (reversedAt: string | null) => ({
      method: "GET",
      path: `/v2/payments/${paymentId}/chargebacks`,
      body: list("chargebacks", [
        {
          id: `chb_${o.id}`,
          amount: { currency: "EUR", value: "20.00" },
          paymentId,
          reason: { code: "AC04", description: "Paiement contesté" },
          createdAt: "2026-11-18T09:00:00Z",
          reversedAt,
        },
      ]),
    });
    const payment = {
      method: "GET",
      path: `/v2/payments/${paymentId}`,
      body: {
        id: paymentId,
        status: "paid",
        amount: { currency: "EUR", value: "20.00" },
        amountChargedBack: { currency: "EUR", value: "20.00" },
        _links: {},
      },
    };
    mollie(payment, chargeback(null));
    await syncPaymentFromMollie(r.orderId);
    const dispute = await db.dispute.findUniqueOrThrow({
      where: { mollieChargebackId: `chb_${o.id}` },
    });
    expect(dispute).toMatchObject({
      orderId: r.orderId,
      accountId: o.mollieOrganizationId,
      amountMinor: 2000,
      currency: "EUR",
      reason: "Paiement contesté",
      status: "NEEDS_RESPONSE",
      stripeDisputeId: null,
    });
    const notes = () =>
      db.notification.count({
        where: { organizationId: o.org.id, type: "DISPUTE_OPENED" },
      });
    const first = await notes();
    expect(first).toBeGreaterThan(0);
    vi.unstubAllGlobals();
    mollie(payment, chargeback("2026-11-25T09:00:00Z"));
    await syncPaymentFromMollie(r.orderId);
    expect(
      (await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } }))
        .status,
    ).toBe("WON");
    expect(await notes()).toBe(first);
    // le litige ouvert figure dans les Finances tant qu'il n'est pas réglé
    vi.unstubAllGlobals();
    await db.dispute.update({
      where: { id: dispute.id },
      data: { status: "NEEDS_RESPONSE" },
    });
    mollie({ method: "GET", path: "/v2/balances/primary", status: 503 });
    const view = await paymentsOverview(o.ctx);
    if (!view.connected) throw new Error("compte relié attendu");
    expect(view.disputes.map((d) => d.id)).toEqual([dispute.id]);
  });

  it("versement échoué vers la banque : signalé une seule fois", async () => {
    // seuls les comptes de ce test comptent
    await db.mollieAccount.updateMany({
      where: { disconnectedAt: null },
      data: { disconnectedAt: new Date() },
    });
    const o = await organizer();
    const failed = {
      method: "GET",
      path: "/v2/settlements",
      body: list("settlements", [
        {
          id: `stl_ok_${o.id}`,
          status: "paidout",
          amount: { currency: "EUR", value: "50.00" },
          createdAt: "2026-11-10T10:00:00Z",
        },
        {
          id: `stl_ko_${o.id}`,
          status: "failed",
          amount: { currency: "EUR", value: "15.00" },
          createdAt: "2026-11-18T10:00:00Z",
        },
      ]),
    };
    mollie(failed, failed);
    expect(await notifyFailedSettlements()).toBe(1);
    expect(await notifyFailedSettlements()).toBe(0);
    expect(
      await db.notification.count({
        where: { organizationId: o.org.id, type: "PAYOUT_FAILED" },
      }),
    ).toBeGreaterThan(0);
    expect(
      (
        await db.mollieAccount.findUniqueOrThrow({
          where: { organizationId: o.org.id },
        })
      ).failedSettlementNotifiedId,
    ).toBe(`stl_ko_${o.id}`);
  });
});
