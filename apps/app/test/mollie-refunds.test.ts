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

const { db } = await import("@/lib/db");
const { finalizeOrder, reserveOrder, submitBuyer } =
  await import("@/server/checkout");
const { saveMollieAuthorization } = await import("@/server/mollieAccounts");
const { syncPaymentFromMollie } = await import("@/server/molliePayments");
const { refundTickets } = await import("@/server/refunds");
const { createListing, reserveResale } = await import("@/server/resale");
const { MOLLIE_REFUND_FEE_MINOR, estimateBankFee, resaleAmounts } =
  await import("@evoly/core");

type Route = { method: string; path: string; status?: number; body?: unknown };
type Call = { method: string; url: URL; body: string; headers: Headers };
const calls: Call[] = [];

/** Mollie répond selon la méthode et le chemin ; chaque réponse ne sert qu'une fois, dans l'ordre donné. */
function mollie(...routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      calls.push({
        method,
        url,
        body: typeof init.body === "string" ? init.body : "",
        headers: new Headers(init.headers),
      });
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
  scope: "payments.read payments.write refunds.read refunds.write",
};

/** Organisation au compte Mollie prêt, et deux billets à 20 € payés par Mollie (paiement relu, simulé). */
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
  const user = await db.user.create({
    data: { name: "Orga", email: `orga.${id}@exemple.be`, emailVerified: true },
  });
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
      methods: ["bancontact", "creditcard"],
      onboardingStatus: "COMPLETED",
      canReceivePayments: true,
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `concert-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Concert ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Fosse",
          priceMinor: 2000,
          currency: "EUR",
          quantity: 100,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 2 }],
    locale: "fr",
  });
  const molliePaymentId = `tr_vendeur_${id}`;
  await db.order.update({
    where: { id: r.orderId },
    data: {
      buyerFirstName: "Léa",
      buyerLastName: "Martin",
      buyerEmail: `lea.${id}@exemple.be`,
      molliePaymentId,
      paymentProvider: "MOLLIE",
    },
  });
  expect(
    await finalizeOrder(r.orderId, {
      molliePaymentId,
      amountMinor: 4000,
      currency: "EUR",
      paymentMethodType: "creditcard",
    }),
  ).toBe("PAID");
  const tickets = await db.ticket.findMany({ where: { orderId: r.orderId } });
  const ctx = {
    organization: { id: org.id, slug: org.slug },
    user: { id: user.id, name: user.name, email: user.email },
  } as never;
  return {
    id,
    org,
    event,
    ctx,
    orderId: r.orderId,
    token: r.token,
    tickets,
    molliePaymentId,
  };
}

describe("remboursements par Mollie (docs/MOLLIE.md, lot 4)", () => {
  it("remboursement par l'organisateur : sur le paiement Mollie de la commande, montant du billet, commission non rendue ; état suivi par le webhook", async () => {
    const s = await setup();
    mollie({
      method: "POST",
      path: `/v2/payments/${s.molliePaymentId}/refunds`,
      status: 201,
      body: {
        id: `re_orga_${s.id}`,
        status: "pending",
        amount: { currency: "EUR", value: "20.00" },
      },
    });
    expect(
      await refundTickets(s.ctx, s.orderId, [s.tickets[0]!.id], "OTHER", null),
    ).toBe("PROCESSING");
    const create = calls[0]!;
    expect(JSON.parse(create.body)).toMatchObject({
      amount: { currency: "EUR", value: "20.00" },
      metadata: { orderId: s.orderId, reason: "OTHER" },
    });
    const refund = await db.refund.findFirstOrThrow({
      where: { orderId: s.orderId },
    });
    expect(create.headers.get("idempotency-key")).toBe(`refund:${refund.id}`);
    expect(refund).toMatchObject({
      mollieRefundId: `re_orga_${s.id}`,
      status: "PROCESSING",
    });
    expect(
      await db.order.findUniqueOrThrow({ where: { id: s.orderId } }),
    ).toMatchObject({ status: "PARTIALLY_REFUNDED", refundedMinor: 2000 });
    // Mollie appelle le webhook du paiement : remboursement relu, effectué
    vi.unstubAllGlobals();
    mollie(
      {
        method: "GET",
        path: `/v2/payments/${s.molliePaymentId}`,
        body: {
          id: s.molliePaymentId,
          status: "paid",
          amount: { currency: "EUR", value: "40.00" },
          _links: {},
        },
      },
      {
        method: "GET",
        path: `/v2/payments/${s.molliePaymentId}/refunds`,
        body: {
          count: 1,
          _embedded: {
            refunds: [
              {
                id: `re_orga_${s.id}`,
                status: "refunded",
                amount: { currency: "EUR", value: "20.00" },
              },
            ],
          },
          _links: { next: null },
        },
      },
    );
    await syncPaymentFromMollie(s.orderId);
    expect(
      (await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status,
    ).toBe("SUCCEEDED");
  });

  it("état relu par le webhook : en file d'attente chez Mollie, toujours en cours ; échoué, avec sa raison ; remboursement fait directement chez Mollie ignoré (RG-REF-03)", async () => {
    const s = await setup();
    const created = (id: string) => ({
      method: "POST",
      path: `/v2/payments/${s.molliePaymentId}/refunds`,
      status: 201,
      body: {
        id,
        status: "pending",
        amount: { currency: "EUR", value: "20.00" },
      },
    });
    mollie(created(`re_file_${s.id}`), created(`re_echec_${s.id}`));
    for (const t of s.tickets)
      expect(await refundTickets(s.ctx, s.orderId, [t.id], "OTHER", null)).toBe(
        "PROCESSING",
      );
    vi.unstubAllGlobals();
    const relu = (id: string, status: string, value = "20.00") => ({
      id,
      status,
      amount: { currency: "EUR", value },
    });
    mollie(
      {
        method: "GET",
        path: `/v2/payments/${s.molliePaymentId}`,
        body: {
          id: s.molliePaymentId,
          status: "paid",
          amount: { currency: "EUR", value: "40.00" },
          _links: {},
        },
      },
      {
        method: "GET",
        path: `/v2/payments/${s.molliePaymentId}/refunds`,
        body: {
          count: 3,
          _embedded: {
            refunds: [
              relu(`re_file_${s.id}`, "queued"),
              relu(`re_echec_${s.id}`, "failed"),
              relu(`re_direct_${s.id}`, "refunded", "5.00"),
            ],
          },
          _links: { next: null },
        },
      },
    );
    await syncPaymentFromMollie(s.orderId);
    // le remboursement fait directement chez Mollie, inconnu d'Evoly, n'est pas repris
    expect(
      await db.refund.findMany({
        where: { orderId: s.orderId },
        select: { mollieRefundId: true, status: true, failureReason: true },
        orderBy: { mollieRefundId: "asc" },
      }),
    ).toEqual([
      {
        mollieRefundId: `re_echec_${s.id}`,
        status: "FAILED",
        failureReason: "échec Mollie",
      },
      {
        mollieRefundId: `re_file_${s.id}`,
        status: "PROCESSING",
        failureReason: null,
      },
    ]);
  });

  it("Mollie refuse le remboursement : échec enregistré, relançable par l'organisateur", async () => {
    const s = await setup();
    mollie({
      method: "POST",
      path: `/v2/payments/${s.molliePaymentId}/refunds`,
      status: 422,
      body: {
        status: 422,
        title: "Unprocessable Entity",
        detail: "The refund amount is higher than the balance",
      },
    });
    expect(
      await refundTickets(s.ctx, s.orderId, [s.tickets[0]!.id], "OTHER", null),
    ).toBe("FAILED");
    const refund = await db.refund.findFirstOrThrow({
      where: { orderId: s.orderId },
    });
    expect(refund.status).toBe("FAILED");
    expect(refund.failureReason).toContain("higher than the balance");
    expect(
      await db.auditLog.count({
        where: { targetId: refund.id, action: "refund.failed" },
      }),
    ).toBe(1);
  });

  it("revente : le vendeur qui avait payé par Mollie est remboursé sur son paiement, moins la commission et les frais du paiement de l'acheteur et du remboursement", async () => {
    const s = await setup();
    const listing = await createListing(s.token, s.tickets[0]!.id, "20");
    const r = await reserveResale(listing.linkCode, "fr");
    const buyerPayment = `tr_acheteur_${s.id}`;
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: buyerPayment,
        status: "open",
        _links: { checkout: { href: "https://www.mollie.com/checkout/x" } },
      },
    });
    expect(
      await submitBuyer(
        r.token,
        {
          firstName: "Tom",
          lastName: "Dubois",
          email: `tom.${s.id}@exemple.be`,
          marketingOptIn: false,
        },
        undefined,
        { returnUrl: `https://club.evoly.me/billets/${r.token}` },
      ),
    ).toMatchObject({ kind: "REDIRECT" });
    vi.unstubAllGlobals();
    calls.length = 0;
    mollie(
      {
        method: "GET",
        path: `/v2/payments/${buyerPayment}`,
        body: {
          id: buyerPayment,
          status: "paid",
          amount: { currency: "EUR", value: "20.00" },
          method: "bancontact",
          details: null,
          _links: {},
        },
      },
      {
        method: "POST",
        path: `/v2/payments/${s.molliePaymentId}/refunds`,
        status: 201,
        body: { id: `re_vendeur_${s.id}`, status: "pending" },
      },
    );
    await syncPaymentFromMollie(r.orderId);
    const buyerOrder = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
    });
    expect(buyerOrder.status).toBe("PAID");
    const sellerRefund = calls.find((c) =>
      c.url.pathname.endsWith("/refunds"),
    )!;
    const expected = resaleAmounts(
      2000,
      (
        buyerOrder.feeSnapshot as unknown as {
          terms: Parameters<typeof resaleAmounts>[1];
        }
      ).terms,
      estimateBankFee(2000, "card_eea_standard") + MOLLIE_REFUND_FEE_MINOR,
    ).sellerRefundMinor;
    const value = `${Math.floor(expected / 100)}.${String(expected % 100).padStart(2, "0")}`;
    expect(JSON.parse(sellerRefund.body)).toMatchObject({
      amount: { currency: "EUR", value },
      metadata: { resaleListingId: listing.id, buyerOrderId: r.orderId },
    });
    expect(sellerRefund.headers.get("idempotency-key")).toBe(
      `resale:${listing.id}:seller-refund`,
    );
    expect(
      await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } }),
    ).toMatchObject({
      sellerMollieRefundId: `re_vendeur_${s.id}`,
      sellerRefundMinor: expected,
    });
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: s.orderId } }))
        .refundedMinor,
    ).toBe(expected);
  });
});
