import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateBankFee } from "@evoly/core";
import { db } from "@/lib/db";
import {
  finalizeOrder,
  reservationByToken,
  reserveOrder,
} from "@/server/checkout";
import { findOrgContext, type OrgContext } from "@/server/context";
import { orderConfirmationEmail } from "@/server/email/templates";
import { createEvent } from "@/server/events";
import { saveMollieAuthorization } from "@/server/mollieAccounts";
import { setRefundFeeDefault } from "@/server/organization";
import { cancelEvent, refundTickets, requestRefund } from "@/server/refunds";

// remboursement à coût neutre (RG-REF-09 à RG-REF-11) : intégral, ou moins les frais de paiement et la commission,
// seulement quand l'acheteur demande pour son propre motif ; figé sur la commande à la réservation

const rid = () => Math.random().toString(36).slice(2, 10);

/** Mollie simulé : chaque remboursement demandé sur un paiement est capturé (montant exact rendu à l'acheteur), et effectué aussitôt. */
const fake = {
  refunds: [] as Array<{
    paymentId: string;
    amountMinor: number;
    body: Record<string, unknown>;
  }>,
};
beforeEach(() => {
  fake.refunds = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const m = /^\/v2\/payments\/([^/]+)\/refunds$/.exec(url.pathname);
      if (init.method !== "POST" || !m)
        return new Response(
          JSON.stringify({
            status: 404,
            title: "Not Found",
            detail: url.pathname,
          }),
          { status: 404 },
        );
      const body = JSON.parse(String(init.body)) as {
        amount: { currency: string; value: string };
      };
      fake.refunds.push({
        paymentId: m[1]!,
        amountMinor: Math.round(Number(body.amount.value) * 100),
        body,
      });
      return new Response(
        JSON.stringify({
          id: `re_${rid()}`,
          status: "refunded",
          amount: body.amount,
        }),
        { status: 201 },
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

type Mode = "FULL" | "MINUS_FEES";

/** Organisation (propriétaire), compte Mollie prêt, événement payant « toujours remboursable », 2 billets à 20 €. */
async function setup(mode: Mode, opts: { quantity?: number } = {}) {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
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
  const role = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: role.id,
      status: "ACTIVE",
    },
  });
  const ctx: OrgContext = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: "Camille", email: owner.email },
  };
  const account = await saveMollieAuthorization({
    organizationId: org.id,
    mollieOrganizationId: `org_${id}`,
    tokens: {
      access_token: "access_mollie",
      refresh_token: "refresh_mollie",
      expires_in: 3600,
      token_type: "bearer",
      scope: "payments.read payments.write refunds.read refunds.write",
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
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * 86_400_000),
      status: "PUBLISHED",
      refundPolicy: "ALWAYS",
      refundFeeMode: mode,
      ticketTypes: {
        create: {
          name: "Fosse",
          priceMinor: 2_000,
          currency: "EUR",
          quantity: 50,
        },
      },
    },
    include: { ticketTypes: true },
  });
  return { id, org, ctx, event, ticketTypeId: event.ticketTypes[0]!.id };
}

/** Achat payé par Mollie (paiement relu, simulé), frais de paiement réels relevés : 0,80 €. */
async function buy(
  s: Awaited<ReturnType<typeof setup>>,
  quantity = 2,
  paymentFeeMinor: number | null = 80,
) {
  const r = await reserveOrder({
    eventId: s.event.id,
    lines: [{ ticketTypeId: s.ticketTypeId, quantity }],
    locale: "fr",
  });
  await db.order.update({
    where: { id: r.orderId },
    data: {
      buyerFirstName: "Léa",
      buyerLastName: "Martin",
      buyerEmail: `lea.${s.id}@exemple.be`,
    },
  });
  expect(
    await finalizeOrder(r.orderId, {
      molliePaymentId: `tr_${rid()}`,
      amountMinor: r.totalMinor,
      currency: "EUR",
      paymentMethodType: "creditcard",
    }),
  ).toBe("PAID");
  const order = await db.order.update({
    where: { id: r.orderId },
    data: { paymentFeeMinor },
  });
  const tickets = await db.ticket.findMany({
    where: { orderId: r.orderId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return {
    r,
    order,
    tickets,
    fees: order.applicationFeeMinor + (paymentFeeMinor ?? 0),
  };
}

const refundOf = (orderId: string) =>
  db.refund.findFirstOrThrow({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });

describe("remboursement demandé par l'acheteur (RG-REF-09, RG-REF-10)", () => {
  it("intégral : l'acheteur récupère 100 %, Evoly garde sa commission (comportement d'avant)", async () => {
    const s = await setup("FULL");
    const b = await buy(s);
    await requestRefund(
      b.r.token,
      b.tickets.map((t) => t.id),
      null,
    );
    expect(await refundOf(b.order.id)).toMatchObject({
      amountMinor: 4_000,
      feesWithheldMinor: 0,
      status: "SUCCEEDED",
    });
    // sur le paiement Mollie de la commande ; rien d'autre n'est demandé : Mollie ne rend jamais la commission d'Evoly
    expect(fake.refunds).toEqual([
      {
        paymentId: b.order.molliePaymentId,
        amountMinor: 4_000,
        body: {
          amount: { currency: "EUR", value: "40.00" },
          description: expect.any(String),
          metadata: expect.objectContaining({ orderId: b.order.id }),
        },
      },
    ]);
  });

  it("moins les frais, commande entière : prix payé moins les frais de paiement et la commission", async () => {
    const s = await setup("MINUS_FEES");
    const b = await buy(s);
    expect(b.order.applicationFeeMinor).toBeGreaterThan(0);
    await requestRefund(
      b.r.token,
      b.tickets.map((t) => t.id),
      null,
    );
    expect(await refundOf(b.order.id)).toMatchObject({
      amountMinor: 4_000 - b.fees,
      feesWithheldMinor: b.fees,
    });
    expect(fake.refunds).toEqual([
      expect.objectContaining({ amountMinor: 4_000 - b.fees }), // Evoly garde sa commission
    ]);
    // coût neutre pour l'organisateur : remboursé exactement ce qu'il a touché ; commande remboursée en entier
    expect(
      await db.order.findUniqueOrThrow({ where: { id: b.order.id } }),
    ).toMatchObject({ refundedMinor: 4_000 - b.fees, status: "REFUNDED" });
  });

  it("moins les frais, remboursement partiel : au prorata, le total retenu ne dépasse jamais les frais", async () => {
    const s = await setup("MINUS_FEES");
    const b = await buy(s);
    await requestRefund(b.r.token, [b.tickets[0]!.id], null);
    const first = await refundOf(b.order.id);
    expect(first.feesWithheldMinor).toBe(Math.round(b.fees / 2));
    expect(first.amountMinor).toBe(2_000 - Math.round(b.fees / 2));
    await requestRefund(b.r.token, [b.tickets[1]!.id], null);
    const second = await refundOf(b.order.id);
    expect(first.feesWithheldMinor + second.feesWithheldMinor).toBe(b.fees);
    expect(fake.refunds.map((r) => r.amountMinor)).toEqual([
      first.amountMinor,
      second.amountMinor,
    ]);
  });

  it("frais de paiement réels pas encore connus : estimés d'après la grille Mollie, comme dans les finances", async () => {
    const s = await setup("MINUS_FEES");
    const b = await buy(s, 2, null);
    await requestRefund(
      b.r.token,
      b.tickets.map((t) => t.id),
      null,
    );
    const refund = await refundOf(b.order.id);
    expect(refund.feesWithheldMinor).toBe(
      b.order.applicationFeeMinor + estimateBankFee(4_000),
    );
    expect(refund.amountMinor + refund.feesWithheldMinor).toBe(4_000);
  });

  it("changement de date ou de lieu : pas du fait de l'acheteur, toujours remboursé en entier", async () => {
    const s = await setup("MINUS_FEES");
    const b = await buy(s);
    await db.event.update({
      where: { id: s.event.id },
      data: { lastMajorChangeAt: new Date() },
    });
    await requestRefund(
      b.r.token,
      b.tickets.map((t) => t.id),
      null,
    );
    expect(await refundOf(b.order.id)).toMatchObject({
      reason: "EVENT_CHANGED",
      amountMinor: 4_000,
      feesWithheldMinor: 0,
    });
  });

  it("la règle affichée avant l'achat est celle qui s'applique : figée sur la commande à la réservation", async () => {
    const s = await setup("MINUS_FEES");
    const b = await buy(s);
    expect(b.order.refundFeeMode).toBe("MINUS_FEES");
    await db.event.update({
      where: { id: s.event.id },
      data: { refundFeeMode: "FULL" },
    });
    await requestRefund(
      b.r.token,
      b.tickets.map((t) => t.id),
      null,
    );
    expect((await refundOf(b.order.id)).feesWithheldMinor).toBe(b.fees);
    // la réservation suivante, elle, suit le nouveau réglage, et le tunnel d'achat l'affiche
    const next = await reserveOrder({
      eventId: s.event.id,
      lines: [{ ticketTypeId: s.ticketTypeId, quantity: 1 }],
      locale: "fr",
    });
    expect(next.refund).toMatchObject({ policy: "ALWAYS", feeMode: "FULL" });
    expect((await reservationByToken(next.token))?.refund).toMatchObject({
      feeMode: "FULL",
      timezone: "Europe/Brussels",
    });
  });
});

describe("toujours 100 %, quel que soit le réglage : ce n'est pas le fait de l'acheteur", () => {
  it("annulation de l'événement par l'organisateur", async () => {
    const s = await setup("MINUS_FEES");
    const b = await buy(s);
    await cancelEvent(s.ctx, s.event.id, "Salle indisponible", s.event.title);
    expect(await refundOf(b.order.id)).toMatchObject({
      reason: "EVENT_CANCELLED",
      amountMinor: 4_000,
      feesWithheldMinor: 0,
    });
    expect(fake.refunds).toEqual([
      expect.objectContaining({ amountMinor: 4_000 }),
    ]);
  });

  it("commande annulée ou acheteur retiré à l'initiative de l'organisateur", async () => {
    const s = await setup("MINUS_FEES");
    const b = await buy(s);
    await refundTickets(s.ctx, b.order.id, [b.tickets[0]!.id], "OTHER", null);
    expect(await refundOf(b.order.id)).toMatchObject({
      initiator: "ORGANIZER",
      amountMinor: 2_000,
      feesWithheldMinor: 0,
    });
  });
});

describe("réglage par événement, valeur par défaut de l'organisation", () => {
  it("un nouvel événement reprend la valeur de l'organisation ; ses réglages la changent ensuite", async () => {
    const s = await setup("FULL");
    await setRefundFeeDefault(s.ctx, "MINUS_FEES");
    const created = await createEvent(
      s.ctx,
      {
        title: "Concert",
        startsAtLocal: "2027-05-20T20:00",
        endsAtLocal: "2027-05-20T23:00",
        timezone: "Europe/Brussels",
        locationType: "PHYSICAL",
        locationName: "Salle",
        city: "Bruxelles",
        country: "BE",
      },
      { name: "Fosse", price: "20", quantity: 100 },
    );
    const ev = await db.event.findUniqueOrThrow({ where: { id: created.id } });
    expect(ev.refundFeeMode).toBe("MINUS_FEES");
    expect(
      await db.auditLog.count({
        where: {
          organizationId: s.org.id,
          action: "organization.refund_default_changed",
        },
      }),
    ).toBe(1);
  });
});

describe("e-mail de confirmation : la règle rappelée (RG-REF-11)", () => {
  it("politique et frais, dans la langue de l'acheteur ; rien pour une commande gratuite", () => {
    const base = {
      locale: "fr" as const,
      organizationName: "Club",
      eventTitle: "Gala",
      when: "samedi",
      where: null,
      online: null,
      lines: [{ name: "Fosse", quantity: 2 }],
      total: "40,00 €",
      reference: "ABC123",
      url: "https://club.evoly.me/billets/x",
      firstName: "Léa",
    };
    const minus = orderConfirmationEmail({
      ...base,
      refund: {
        policy: "UNTIL_DEADLINE",
        deadline: "12 décembre 2026",
        feeMode: "MINUS_FEES",
      },
    });
    expect(minus.text).toContain(
      "Remboursement : Remboursables jusqu’au 12 décembre 2026. Les frais de paiement et de service ne sont pas remboursés.",
    );
    const full = orderConfirmationEmail({
      ...base,
      locale: "en",
      refund: { policy: "ALWAYS", deadline: null, feeMode: "FULL" },
    });
    expect(full.text).toContain(
      "Refunds : Refundable until the event starts. The price paid is refunded in full.",
    );
    const none = orderConfirmationEmail({
      ...base,
      refund: {
        policy: "NON_REFUNDABLE",
        deadline: null,
        feeMode: "MINUS_FEES",
      },
    });
    expect(none.text).toContain(
      "Remboursement : Billets non remboursables, sauf annulation de l’événement.",
    );
    expect(none.text).not.toContain("frais de paiement");
    expect(
      orderConfirmationEmail({ ...base, refund: null }).text,
    ).not.toContain("Remboursement");
  });
});
