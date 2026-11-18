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
// Stripe absent : seul Mollie encaisse (docs/MOLLIE.md)
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));

const { db } = await import("@/lib/db");
const { reserveOrder, reservationByToken, submitBuyer } =
  await import("@/server/checkout");
const { saveMollieAuthorization } = await import("@/server/mollieAccounts");
const { paymentAccountFor, syncPaymentFromMollie } =
  await import("@/server/molliePayments");
const { eventPublicationBlockers } = await import("@/server/events");
const { POST: webhook } = await import("@/app/api/webhooks/mollie/route");

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
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const buyer = (email: string) => ({
  firstName: "Léa",
  lastName: "Martin",
  email,
  marketingOptIn: false,
});
const tokens = {
  access_token: "access_mollie",
  refresh_token: "refresh_mollie",
  expires_in: 3600,
  token_type: "bearer",
  scope: "payments.read payments.write refunds.write",
};
const checkout = (id: string) => ({
  href: `https://www.mollie.com/checkout/select-method/${id}`,
});

/** Organisation au compte Mollie prêt, événement à 15 € (100 places). */
async function setup(o: { ready?: boolean; capacity?: number } = {}) {
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
  const account = await saveMollieAuthorization({
    organizationId: org.id,
    mollieOrganizationId: `org_${id}`,
    tokens,
    testmode: false,
  });
  if (o.ready !== false)
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
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: days(30),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      capacity: o.capacity ?? null,
      ticketTypes: {
        create: [
          {
            name: "Entrée",
            priceMinor: 1500,
            currency: "EUR",
            quantity: 100,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });
  return { id, org, event, ticketTypeId: event.ticketTypes[0]!.id };
}

async function reserveAndStart(s: Awaited<ReturnType<typeof setup>>) {
  const r = await reserveOrder({
    eventId: s.event.id,
    lines: [{ ticketTypeId: s.ticketTypeId, quantity: 2 }],
    locale: "fr",
  });
  const paymentId = `tr_${rid()}`;
  mollie({
    method: "POST",
    path: "/v2/payments",
    status: 201,
    body: {
      id: paymentId,
      status: "open",
      amount: { currency: "EUR", value: "30.00" },
      _links: { checkout: checkout(paymentId) },
    },
  });
  const res = await submitBuyer(
    r.token,
    buyer(`lea.${rid()}@exemple.be`),
    undefined,
    {
      returnUrl: `https://club.evoly.me/billets/${r.token}`,
    },
  );
  vi.unstubAllGlobals();
  // l'appel de création est rendu à part : les vérifications suivantes ne voient que leurs propres appels
  const create = calls.find((c) => c.method === "POST")!;
  calls.length = 0;
  return { r, res, paymentId, create };
}

const paid = (
  id: string,
  fingerprint: string | null = "fp_carte",
  value = "30.00",
) => ({
  id,
  status: "paid",
  amount: { currency: "EUR", value },
  method: "creditcard",
  details: fingerprint ? { cardFingerprint: fingerprint } : null,
  _links: {},
});

describe("paiement des billets par Mollie : compte qui encaisse", () => {
  it("Mollie prêt l'emporte ; à défaut, l'ancien compte Stripe s'il encaisse encore ; sinon aucun", async () => {
    const ready = await setup();
    expect((await paymentAccountFor(ready.org.id))?.provider).toBe("MOLLIE");
    const notReady = await setup({ ready: false });
    expect(await paymentAccountFor(notReady.org.id)).toBeNull();
    await db.stripeAccount.create({
      data: {
        organizationId: notReady.org.id,
        stripeAccountId: `acct_${notReady.id}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
      },
    });
    expect(await paymentAccountFor(notReady.org.id)).toEqual({
      provider: "STRIPE",
      stripeAccountId: `acct_${notReady.id}`,
    });
    await db.stripeAccount.create({
      data: {
        organizationId: ready.org.id,
        stripeAccountId: `acct_${ready.id}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
      },
    });
    expect((await paymentAccountFor(ready.org.id))?.provider).toBe("MOLLIE");
  });

  it("publication d'un événement payant : un compte Mollie prêt suffit", async () => {
    const s = await setup();
    const ctx = (mollieReady: boolean) =>
      ({
        organization: { id: s.org.id },
        stripe: null,
        mollie: mollieReady ? { ready: true } : null,
      }) as never;
    expect(await eventPublicationBlockers(ctx(true), s.event.id)).not.toContain(
      "STRIPE_REQUIRED",
    );
    expect(await eventPublicationBlockers(ctx(false), s.event.id)).toContain(
      "STRIPE_REQUIRED",
    );
  });
});

describe("paiement des billets par Mollie : création du paiement", () => {
  it("réservation annoncée à payer par Mollie ; paiement créé sur le profil de l'organisateur, commission en frais d'application ; réservation prolongée", async () => {
    const s = await setup();
    const before = Date.now();
    const { r, res, paymentId, create } = await reserveAndStart(s);
    expect(r.mollie).toBe(true);
    expect(r.stripeAccountId).toBeNull();
    expect(res).toEqual({ kind: "REDIRECT", url: checkout(paymentId).href });
    const body = JSON.parse(create.body);
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
    });
    expect(body).toMatchObject({
      amount: { currency: "EUR", value: "30.00" },
      profileId: `pfl_${s.id}`,
      redirectUrl: `https://club.evoly.me/billets/${r.token}`,
      locale: "fr_BE",
      metadata: { orderId: r.orderId, reference: order.reference },
    });
    expect(body.description).toContain(order.reference);
    expect(body.webhookUrl).toBeUndefined(); // adresse locale : Mollie la refuserait
    expect(body.testmode).toBeUndefined();
    expect(order.applicationFeeMinor).toBeGreaterThan(0);
    expect(body.applicationFee).toEqual({
      amount: {
        currency: "EUR",
        value: `${Math.floor(order.applicationFeeMinor / 100)}.${String(order.applicationFeeMinor % 100).padStart(2, "0")}`,
      },
      description: `Evoly ${order.reference}`,
    });
    expect(create.headers.get("authorization")).toBe("Bearer access_mollie");
    expect(create.headers.get("idempotency-key")).toBe(
      `order:${r.orderId}:mollie-payment:1`,
    );
    expect(order).toMatchObject({
      molliePaymentId: paymentId,
      paymentProvider: "MOLLIE",
      status: "PENDING",
    });
    expect(order.holdExpiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + 15 * 60_000 - 1000,
    );
    // la page de paiement par code QR annonce aussi Mollie
    expect((await reservationByToken(r.token))?.mollie).toBe(true);
  });

  it("sans adresse de retour, pas de paiement ; paiement encore ouvert repris ; annulé, un nouveau est créé", async () => {
    const s = await setup();
    const { r, paymentId } = await reserveAndStart(s);
    await expect(
      submitBuyer(r.token, buyer("lea@exemple.be")),
    ).rejects.toMatchObject({ code: "PAYMENTS_UNAVAILABLE" });
    const again = { returnUrl: `https://club.evoly.me/billets/${r.token}` };
    mollie({
      method: "GET",
      path: `/v2/payments/${paymentId}`,
      body: {
        id: paymentId,
        status: "open",
        _links: { checkout: checkout(paymentId) },
      },
    });
    expect(
      await submitBuyer(r.token, buyer("lea@exemple.be"), undefined, again),
    ).toEqual({ kind: "REDIRECT", url: checkout(paymentId).href });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    vi.unstubAllGlobals();
    const next = `tr_${rid()}`;
    mollie(
      {
        method: "GET",
        path: `/v2/payments/${paymentId}`,
        body: { id: paymentId, status: "canceled", _links: {} },
      },
      {
        method: "POST",
        path: "/v2/payments",
        status: 201,
        body: {
          id: next,
          status: "open",
          _links: { checkout: checkout(next) },
        },
      },
    );
    expect(
      await submitBuyer(r.token, buyer("lea@exemple.be"), undefined, again),
    ).toEqual({ kind: "REDIRECT", url: checkout(next).href });
    expect(
      calls.find((c) => c.method === "POST")!.headers.get("idempotency-key"),
    ).toBe(`order:${r.orderId}:mollie-payment:${paymentId}`);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: r.orderId } }))
        .molliePaymentId,
    ).toBe(next);
  });
});

describe("paiement des billets par Mollie : validation", () => {
  it("retour de l'acheteur : payé chez Mollie, commande validée avec le moyen de paiement et l'empreinte de la carte, billets émis", async () => {
    const s = await setup();
    const { r, paymentId } = await reserveAndStart(s);
    mollie({
      method: "GET",
      path: `/v2/payments/${paymentId}`,
      body: paid(paymentId),
    });
    expect(await syncPaymentFromMollie(r.orderId)).toBe("paid");
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
      include: { tickets: true },
    });
    expect(order).toMatchObject({
      status: "PAID",
      paymentProvider: "MOLLIE",
      molliePaymentId: paymentId,
      paymentMethodType: "creditcard",
      cardFingerprint: "fp_carte",
      holdExpiresAt: null,
    });
    expect(order.tickets).toHaveLength(2);
    const tt = await db.ticketType.findUniqueOrThrow({
      where: { id: s.ticketTypeId },
    });
    expect(tt).toMatchObject({ quantitySold: 2, quantityHeld: 0 });
    // relu une seconde fois (webhook après le retour) : rien ne change
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/${paymentId}`,
      body: paid(paymentId),
    });
    await syncPaymentFromMollie(r.orderId);
    expect(await db.ticket.count({ where: { orderId: r.orderId } })).toBe(2);
  });

  it("webhook : identifiant relu chez Mollie ; inconnu ignoré (200) ; manquant refusé (400) ; Mollie en panne : 500, Mollie relancera", async () => {
    const s = await setup();
    const { r, paymentId } = await reserveAndStart(s);
    const post = (id?: string) =>
      webhook(
        new Request("http://localhost/api/webhooks/mollie", {
          method: "POST",
          body: new URLSearchParams(id ? { id } : {}),
        }),
      );
    mollie();
    expect((await post("tr_inconnu123")).status).toBe(200);
    expect(calls).toHaveLength(0);
    expect((await post()).status).toBe(400);
    expect((await post("<script>")).status).toBe(200);
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/${paymentId}`,
      status: 503,
      body: { title: "Unavailable" },
    });
    expect((await post(paymentId)).status).toBe(500);
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/${paymentId}`,
      body: paid(paymentId),
    });
    expect((await post(paymentId)).status).toBe(200);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status,
    ).toBe("PAID");
  });

  it("montant différent de la commande : rien n'est validé", async () => {
    const s = await setup();
    const { r, paymentId } = await reserveAndStart(s);
    mollie({
      method: "GET",
      path: `/v2/payments/${paymentId}`,
      body: paid(paymentId, "fp", "1.00"),
    });
    await expect(syncPaymentFromMollie(r.orderId)).rejects.toMatchObject({
      code: "PAYMENT_AMOUNT_MISMATCH",
    });
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status,
    ).toBe("PENDING");
  });

  it("carte bloquée par l'organisation : paiement remboursé en entier chez Mollie, places libérées, aucun billet", async () => {
    const s = await setup();
    const blocked = await db.blockedBuyer.create({
      data: { organizationId: s.org.id, reason: "fraude" },
    });
    await db.blockedCard.create({
      data: {
        blockedBuyerId: blocked.id,
        organizationId: s.org.id,
        fingerprint: "fp_bloquee",
      },
    });
    const { r, paymentId } = await reserveAndStart(s);
    mollie(
      {
        method: "GET",
        path: `/v2/payments/${paymentId}`,
        body: paid(paymentId, "fp_bloquee"),
      },
      {
        method: "POST",
        path: `/v2/payments/${paymentId}/refunds`,
        status: 201,
        body: { id: "re_1", status: "pending" },
      },
    );
    await syncPaymentFromMollie(r.orderId);
    const refund = calls.find((c) => c.url.pathname.endsWith("/refunds"))!;
    expect(JSON.parse(refund.body)).toMatchObject({
      amount: { currency: "EUR", value: "30.00" },
      metadata: { orderId: r.orderId, cause: "blocked" },
    });
    expect(refund.headers.get("idempotency-key")).toBe(
      `order:${r.orderId}:blocked-refund`,
    );
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
    });
    expect(order).toMatchObject({
      status: "REFUNDED",
      refundedMinor: 3000,
      cardFingerprint: "fp_bloquee",
    });
    expect(await db.ticket.count({ where: { orderId: r.orderId } })).toBe(0);
    expect(
      (await db.ticketType.findUniqueOrThrow({ where: { id: s.ticketTypeId } }))
        .quantityHeld,
    ).toBe(0);
  });

  it("paiement arrivé après la fin de la réservation, sans place restante : remboursé en entier chez Mollie", async () => {
    const s = await setup({ capacity: 2 });
    const { r, paymentId } = await reserveAndStart(s);
    // réservation libérée, puis les deux places vendues à quelqu'un d'autre
    await db.order.update({
      where: { id: r.orderId },
      data: { status: "EXPIRED" },
    });
    await db.ticketType.update({
      where: { id: s.ticketTypeId },
      data: { quantityHeld: 0, quantitySold: 2 },
    });
    mollie(
      {
        method: "GET",
        path: `/v2/payments/${paymentId}`,
        body: paid(paymentId),
      },
      {
        method: "POST",
        path: `/v2/payments/${paymentId}/refunds`,
        status: 201,
        body: { id: "re_2", status: "pending" },
      },
    );
    await syncPaymentFromMollie(r.orderId);
    const refund = calls.find((c) => c.url.pathname.endsWith("/refunds"))!;
    expect(JSON.parse(refund.body)).toMatchObject({
      amount: { value: "30.00" },
      metadata: { cause: "unfulfilled" },
    });
    expect(
      await db.order.findUniqueOrThrow({ where: { id: r.orderId } }),
    ).toMatchObject({ status: "REFUNDED", refundedMinor: 3000 });
  });
});
