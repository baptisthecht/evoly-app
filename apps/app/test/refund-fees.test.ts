import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  finalizeOrder,
  reservationByToken,
  reserveOrder,
} from "@/server/checkout";
import { findOrgContext, type OrgContext } from "@/server/context";
import { orderConfirmationEmail } from "@/server/email/templates";
import { createEvent } from "@/server/events";
import { setRefundFeeDefault } from "@/server/organization";
import { cancelEvent, refundTickets, requestRefund } from "@/server/refunds";

// remboursement à coût neutre (RG-REF-09 à RG-REF-11) : intégral, ou moins les frais de paiement et la commission,
// seulement quand l'acheteur demande pour son propre motif ; figé sur la commande à la réservation
const fake = vi.hoisted(() => ({
  refunds: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    refunds: {
      create: async (p: Record<string, unknown>) => {
        fake.refunds.push(p);
        return {
          id: `re_${Math.random().toString(36).slice(2, 10)}`,
          status: "succeeded",
        };
      },
    },
    paymentIntents: {
      cancel: async (id: string) => ({ id, status: "canceled" }),
    },
  }),
}));

const rid = () => Math.random().toString(36).slice(2, 10);
type Mode = "FULL" | "MINUS_FEES";

/** Organisation (propriétaire), compte Stripe actif, événement payant « toujours remboursable », 2 billets à 20 €. */
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
  await db.stripeAccount.create({
    data: {
      organizationId: org.id,
      stripeAccountId: `acct_${id}`,
      country: "BE",
      defaultCurrency: "EUR",
      status: "ACTIVE",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
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

/** Achat payé (paiement simulé), frais de paiement réels relevés : 0,80 €. */
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
      paymentIntentId: `pi_${rid()}`,
      amountMinor: r.totalMinor,
      currency: "eur",
      chargeId: `ch_${rid()}`,
      paymentMethodType: "card",
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

beforeEach(() => {
  fake.refunds = [];
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
    expect(fake.refunds[0]).toMatchObject({
      amount: 4_000,
      refund_application_fee: false,
    });
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
    expect(fake.refunds[0]).toMatchObject({
      amount: 4_000 - b.fees,
      refund_application_fee: false, // Evoly garde sa commission
    });
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
    expect(fake.refunds.map((r) => r.amount)).toEqual([
      first.amountMinor,
      second.amountMinor,
    ]);
  });

  it("frais de paiement pas encore transmis par Stripe : estimés, comme dans les finances", async () => {
    const s = await setup("MINUS_FEES");
    const b = await buy(s, 2, null);
    await requestRefund(
      b.r.token,
      b.tickets.map((t) => t.id),
      null,
    );
    const refund = await refundOf(b.order.id);
    expect(refund.feesWithheldMinor).toBeGreaterThan(
      b.order.applicationFeeMinor,
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
    expect(fake.refunds[0]).toMatchObject({ amount: 4_000 });
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
