import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyTimedDowngrades } from "@/server/billing";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { sendTicketsLookup } from "@/server/orders";
import { refundTickets, rejectRefund } from "@/server/refunds";

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

describe("remboursements (RG-REF-03)", () => {
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
