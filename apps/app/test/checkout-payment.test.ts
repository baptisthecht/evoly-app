import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder, submitBuyer } from "@/server/checkout";
import { saveMollieAuthorization } from "@/server/mollieAccounts";
import { syncPaymentFromMollie } from "@/server/molliePayments";

// commandes payantes : montant minimum, paiement indisponible, paiement par Mollie (création, validation)
type Route = { method: string; path: string; status?: number; body?: unknown };
const calls: Array<{ method: string; path: string; body: string }> = [];

/** Mollie répond selon la méthode et le chemin ; chaque réponse ne sert qu'une fois, dans l'ordre donné. */
function mollie(...routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      calls.push({
        method,
        path: url.pathname,
        body: typeof init.body === "string" ? init.body : "",
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
        { status: r!.status ?? 200 },
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
const returnUrl = (token: string) => ({
  returnUrl: `https://club.evoly.me/billets/${token}`,
});

async function setup(o: {
  priceMinor: number;
  mollie?: boolean;
  tier?: boolean;
}) {
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
  if (o.mollie) {
    const account = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: `org_${id}`,
      tokens: {
        access_token: "access_mollie",
        refresh_token: "refresh_mollie",
        expires_in: 3600,
        token_type: "bearer",
        scope: "payments.read payments.write",
      },
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
  }
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
      ticketTypes: {
        create: [
          {
            name: "Entrée",
            priceMinor: o.priceMinor,
            currency: "EUR",
            quantity: 100,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });
  const ticketTypeId = event.ticketTypes[0]!.id;
  const tier = o.tier
    ? await db.priceTier.create({
        data: {
          ticketTypeId,
          name: "Prévente",
          priceMinor: o.priceMinor,
          quantityLimit: 10,
        },
      })
    : null;
  return { org, event, ticketTypeId, tier };
}

describe("commandes payantes", () => {
  it("montant minimum : une commande sous le minimum d'un paiement en ligne est refusée", async () => {
    const { event, ticketTypeId } = await setup({ priceMinor: 20 });
    await expect(
      reserveOrder({
        eventId: event.id,
        lines: [{ ticketTypeId, quantity: 1 }],
        locale: "fr",
      }),
    ).rejects.toMatchObject({
      code: "BELOW_MINIMUM_CHARGE",
    });
  });

  it("paiements indisponibles : sans compte Mollie prêt, la commande payante est refusée, sans appel à Mollie", async () => {
    const { event, ticketTypeId } = await setup({ priceMinor: 1500 });
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 1 }],
      locale: "fr",
    });
    mollie();
    await expect(
      submitBuyer(
        r.token,
        buyer("lea@exemple.be"),
        undefined,
        returnUrl(r.token),
      ),
    ).rejects.toMatchObject({ code: "PAYMENTS_UNAVAILABLE" });
    expect(calls).toHaveLength(0);
  });

  it("paiement par Mollie : montant demandé, paiement rattaché à la commande ; validé : payée, billets et palier de prix comptés, une seule fois", async () => {
    const { event, ticketTypeId, tier } = await setup({
      priceMinor: 1500,
      mollie: true,
      tier: true,
    });
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 2 }],
      locale: "fr",
    });
    const paymentId = `tr_${rid()}`;
    const checkout = `https://www.mollie.com/checkout/select-method/${paymentId}`;
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: paymentId,
        status: "open",
        amount: { currency: "EUR", value: "30.00" },
        _links: { checkout: { href: checkout } },
      },
    });
    expect(
      await submitBuyer(
        r.token,
        buyer("lea@exemple.be"),
        undefined,
        returnUrl(r.token),
      ),
    ).toEqual({ kind: "REDIRECT", url: checkout });
    // détail de la demande (profil, commission en frais d'application) : mollie-payments.test.ts
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      amount: { currency: "EUR", value: "30.00" },
    });
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
    });
    expect(order).toMatchObject({
      molliePaymentId: paymentId,
      status: "PENDING",
      totalMinor: 3000,
    });
    // paiement relu chez Mollie (retour de l'acheteur ou webhook)
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/${paymentId}`,
      body: {
        id: paymentId,
        status: "paid",
        amount: { currency: "EUR", value: "30.00" },
        method: "creditcard",
        details: { cardFingerprint: "fp_carte_lea" },
        _links: {},
      },
    });
    expect(await syncPaymentFromMollie(r.orderId)).toBe("paid");
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe("PAID");
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(2);
    expect(
      (await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } }))
        .quantitySold,
    ).toBe(2);
    const t = await db.priceTier.findUniqueOrThrow({ where: { id: tier!.id } });
    expect([t.quantitySold, t.quantityHeld]).toEqual([2, 0]);
    // une seconde validation du même paiement ne compte rien deux fois
    expect(
      await finalizeOrder(order.id, {
        molliePaymentId: paymentId,
        amountMinor: order.totalMinor,
        currency: "EUR",
      }),
    ).toBe("ALREADY_PAID");
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(2);
    expect(
      (await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } }))
        .quantitySold,
    ).toBe(2);
  });
});
