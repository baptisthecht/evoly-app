import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyTimedDowngrades } from "@/server/billing";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { sendTicketsLookup } from "@/server/orders";
import {
  refundTickets,
  rejectRefund,
  syncStripeRefund,
} from "@/server/refunds";
import { accountStatus } from "@/server/stripeConnect";
import { handleConnectEvent } from "@/server/stripeConnectEvents";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille Dupont",
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
  const ownerRole = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Entrée",
          priceMinor: 1000,
          currency: "EUR",
          quantity: 50,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  const paid = async (email = `client.${rid()}@exemple.be`) => {
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }],
      locale: "fr",
    });
    await db.order.update({
      where: { id: r.orderId },
      data: {
        buyerEmail: email,
        buyerFirstName: "Alex",
        buyerLastName: "Martin",
      },
    });
    expect(await finalizeOrder(r.orderId)).toBe("PAID");
    return db.order.findUniqueOrThrow({
      where: { id: r.orderId },
      include: { tickets: true },
    });
  };
  return { owner, org, ctx, paid };
}

describe("compte Stripe de l'organisateur (RG-PAY-01)", () => {
  const req = (r: Record<string, unknown> = {}) =>
    ({
      currently_due: [],
      eventually_due: [],
      disabled_reason: null,
      ...r,
    }) as never;
  it("état : désactivé, actif, à compléter bientôt, en attente, restreint", () => {
    expect(
      accountStatus({
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
        requirements: req({ disabled_reason: "rejected.fraud" }),
      }),
    ).toBe("DISABLED");
    expect(
      accountStatus({
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: req(),
      }),
    ).toBe("ACTIVE");
    expect(
      accountStatus({
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: req({ eventually_due: ["individual.id_number"] }),
      }),
    ).toBe("RESTRICTED_SOON");
    expect(
      accountStatus({
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: req(),
      }),
    ).toBe("PENDING");
    expect(
      accountStatus({
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
        requirements: req({ currently_due: ["external_account"] }),
      }),
    ).toBe("RESTRICTED");
  });

  it("notification « compte mis à jour » : état et autorisations enregistrés", async () => {
    const s = await setup();
    const acct = `acct_${rid()}`;
    await db.stripeAccount.create({
      data: {
        organizationId: s.org.id,
        stripeAccountId: acct,
        country: "BE",
        defaultCurrency: "EUR",
      },
    });
    const account = {
      id: acct,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: {
        currently_due: [],
        eventually_due: [],
        disabled_reason: null,
      },
    };
    expect(
      await handleConnectEvent({
        id: `evt_${rid()}`,
        type: "account.updated",
        data: { object: account },
      } as never),
    ).toBe("PROCESSED");
    expect(
      await db.stripeAccount.findUniqueOrThrow({
        where: { stripeAccountId: acct },
      }),
    ).toMatchObject({
      status: "ACTIVE",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });
  });
});

describe("remboursements (RG-REF-03)", () => {
  it("état final renvoyé par Stripe : réussi, échoué avec sa raison, en cours ; remboursement inconnu ignoré", async () => {
    const s = await setup();
    const o = await s.paid();
    await refundTickets(s.ctx, o.id, [o.tickets[0]!.id], "OTHER", null);
    const refund = await db.refund.findFirstOrThrow({
      where: { orderId: o.id },
    });
    const re = `re_${rid()}`;
    await db.refund.update({
      where: { id: refund.id },
      data: { stripeRefundId: re, status: "PROCESSING" },
    });
    expect(await syncStripeRefund(re, "pending")).toBe(true);
    expect(
      (await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status,
    ).toBe("PROCESSING");
    expect(await syncStripeRefund(re, "failed", "insufficient_funds")).toBe(
      true,
    );
    expect(
      await db.refund.findUniqueOrThrow({ where: { id: refund.id } }),
    ).toMatchObject({ status: "FAILED", failureReason: "insufficient_funds" });
    expect(await syncStripeRefund(re, "succeeded")).toBe(true);
    expect(
      await db.refund.findUniqueOrThrow({ where: { id: refund.id } }),
    ).toMatchObject({ status: "SUCCEEDED", failureReason: null });
    expect(await syncStripeRefund("re_inconnu", "succeeded")).toBe(false);
  });

  it("demande refusée par l'organisateur, avec sa réponse ; jamais deux fois", async () => {
    const s = await setup();
    const o = await s.paid();
    await refundTickets(s.ctx, o.id, [o.tickets[0]!.id], "OTHER", null);
    const modele = await db.refund.findFirstOrThrow({
      where: { orderId: o.id },
    });
    const demande = await db.refund.create({
      data: {
        orderId: o.id,
        initiator: modele.initiator,
        reason: "BUYER_REQUEST",
        amountMinor: 1000,
        message: "Empêché",
      },
    });
    await rejectRefund(
      s.ctx,
      demande.id,
      "  Trop tard pour un remboursement  ",
    );
    expect(
      await db.refund.findUniqueOrThrow({ where: { id: demande.id } }),
    ).toMatchObject({
      status: "REJECTED",
      responseMessage: "Trop tard pour un remboursement",
      handledById: s.owner.id,
    });
    await expect(rejectRefund(s.ctx, demande.id, null)).rejects.toMatchObject({
      code: "REFUND_NOT_PENDING",
    });
  });
});

describe("billets retrouvés par e-mail et fin d'abonnement", () => {
  it("l'acheteur reçoit ses billets par e-mail à sa demande", async () => {
    const s = await setup();
    const email = `client.${rid()}@exemple.be`;
    await s.paid(email);
    const avant = await db.emailMessage.count({ where: { toEmail: email } });
    await sendTicketsLookup(s.org.id, email, "fr");
    expect(
      await db.emailMessage.count({ where: { toEmail: email } }),
    ).toBeGreaterThan(avant);
  });

  it("abonnement Pro résilié : à la fin de la période, le propriétaire est prévenu du passage en Free", async () => {
    const s = await setup();
    await db.subscription.create({
      data: {
        organizationId: s.org.id,
        planId: "pro",
        status: "CANCELED",
        currentPeriodEnd: new Date(Date.now() - 20 * 60_000),
      },
    });
    const avant = await db.emailMessage.count({
      where: { toEmail: s.owner.email },
    });
    expect(await applyTimedDowngrades()).toBeGreaterThanOrEqual(1);
    expect(
      await db.emailMessage.count({ where: { toEmail: s.owner.email } }),
    ).toBeGreaterThan(avant);
  });
});
