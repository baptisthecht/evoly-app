import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import {
  createEvent,
  publishEvent,
  updateEventSettings,
} from "@/server/events";
import { sendTicketsLookup } from "@/server/orders";
import { rejectRefund, requestRefund } from "@/server/refunds";
import { createListing } from "@/server/resale";

// e-mails aux acheteurs dans leur langue (7 langues) : remboursement, billets retrouvés, revente coupée par l'organisateur
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Gala de printemps",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-18T02:00",
  timezone: "Europe/Brussels",
  locationType: "PHYSICAL" as const,
  locationName: "Salle des fêtes",
  city: "Mouscron",
  country: "BE",
};
const settings = {
  ...essentials,
  maxTicketsPerOrder: 10,
  visibility: "PUBLIC" as const,
  refundPolicy: "ON_REQUEST" as const,
  resaleEnabled: true,
  resaleCutoffMinutes: 120,
  showResaleSection: true,
};
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
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  const event = await createEvent(ctx, essentials, {
    name: "Entrée",
    price: "0",
    quantity: 100,
  });
  await updateEventSettings(ctx, event.id, settings);
  await publishEvent(ctx, event.id);
  const ticketTypeId = (
    await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })
  ).id;
  const email = `daan.${id}@exemple.be`;
  const r = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId, quantity: 1 }],
    locale: "nl",
  });
  await submitBuyer(r.token, {
    firstName: "Daan",
    lastName: "Peeters",
    email,
    marketingOptIn: false,
  });
  const order = await db.order.findFirstOrThrow({
    where: { eventId: event.id },
  });
  const ticket = await db.ticket.findFirstOrThrow({
    where: { orderId: order.id },
  });
  return { ctx, org, event, order, ticket, token: r.token, email };
}

describe("e-mails aux acheteurs dans leur langue", () => {
  it("refus d'un remboursement : en néerlandais", async () => {
    const { ctx, order, ticket, token } = await setup();
    await requestRefund(token, [ticket.id], "Ik kan niet komen.");
    const refund = await db.refund.findFirstOrThrow({
      where: { orderId: order.id },
    });
    await rejectRefund(ctx, refund.id, "Buiten de termijn");
    const mail = await db.emailMessage.findFirstOrThrow({
      where: { orderId: order.id, template: "refund.rejected" },
    });
    expect(mail.locale).toBe("nl");
  });

  it("« retrouver mes billets » : en néerlandais", async () => {
    const { org, email } = await setup();
    await sendTicketsLookup(org.id, email, "nl");
    const mail = await db.emailMessage.findFirstOrThrow({
      where: { toEmail: email, template: "order.lookup" },
    });
    expect(mail.locale).toBe("nl");
  });

  it("revente coupée par l'organisateur : annonce retirée, vendeur prévenu en néerlandais", async () => {
    const { ctx, event, ticket, token, email } = await setup();
    const listing = await createListing(token, ticket.id, "0");
    await updateEventSettings(ctx, event.id, {
      ...settings,
      resaleEnabled: false,
    });
    expect(
      (await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("CANCELLED");
    const mail = await db.emailMessage.findFirstOrThrow({
      where: { toEmail: email, template: { startsWith: "resale." } },
      orderBy: { queuedAt: "desc" },
    });
    expect(mail.locale).toBe("nl");
  });
});
