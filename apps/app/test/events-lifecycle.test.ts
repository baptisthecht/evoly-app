import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import {
  createEvent,
  deleteDraft,
  duplicateEvent,
  eventPublicationBlockers,
  exponentFor,
  getEventWithTickets,
  listEvents,
  parsePrice,
  pauseSales,
  publishEvent,
  updateEventSettings,
} from "@/server/events";
import {
  createTicketType,
  deleteTicketType,
  moveTicketType,
  saveTiers,
  setTicketTypeStatus,
  updateTicketType,
} from "@/server/tickets";

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
  // contexte reconstruit comme au début de chaque requête (compte Stripe et offre compris)
  const fresh = async () => ({
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  });
  return { org, ctx: await fresh(), fresh };
}
const audits = (organizationId: string, action: string) =>
  db.auditLog.count({ where: { organizationId, action } });

describe("prix saisis (RG-TKT-02)", () => {
  it("virgule ou point, devises sans centimes, saisie invalide refusée", () => {
    expect(exponentFor("EUR")).toBe(2);
    expect(exponentFor("JPY")).toBe(0);
    expect(parsePrice("12,50", "EUR")).toBe(1250);
    expect(parsePrice("12.5", "EUR")).toBe(1250);
    expect(parsePrice("1500", "JPY")).toBe(1500);
    expect(() => parsePrice("douze", "EUR")).toThrow();
  });
});

describe("vie d'un événement (RG-EVT-01, RG-EVT-07, RG-EVT-08)", () => {
  it("création, publication bloquée sans Stripe pour un tarif payant, publication, pause et reprise, réglages", async () => {
    const s = await setup();
    const e = await createEvent(s.ctx, essentials, {
      name: "Entrée",
      price: "15",
      quantity: 200,
    });
    const ev = await getEventWithTickets(s.ctx, e.id);
    expect(ev).toMatchObject({ status: "DRAFT", title: "Gala de printemps" });
    expect(ev.ticketTypes).toEqual([
      expect.objectContaining({
        name: "Entrée",
        priceMinor: 1500,
        quantity: 200,
      }),
    ]);
    // tarif payant sans compte Stripe prêt : publication bloquée, avec la raison
    const blockers = await eventPublicationBlockers(s.ctx, e.id);
    expect(blockers.length).toBeGreaterThan(0);
    await expect(publishEvent(s.ctx, e.id)).rejects.toMatchObject({
      code: `PUBLISH_${blockers[0]}`,
    });
    await db.stripeAccount.create({
      data: {
        organizationId: s.org.id,
        stripeAccountId: `acct_${rid()}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
    });
    s.ctx = await s.fresh();
    expect(await eventPublicationBlockers(s.ctx, e.id)).toEqual([]);
    await publishEvent(s.ctx, e.id);
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: e.id } })).status,
    ).toBe("PUBLISHED");
    await pauseSales(s.ctx, e.id);
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: e.id } })).status,
    ).toBe("SALES_PAUSED");
    await publishEvent(s.ctx, e.id); // reprise des ventes
    expect(await audits(s.org.id, "event.published")).toBe(1);
    expect(await audits(s.org.id, "event.sales_paused")).toBe(1);
    expect(await audits(s.org.id, "event.sales_resumed")).toBe(1);
    await updateEventSettings(s.ctx, e.id, {
      ...essentials,
      title: "Gala de printemps 2027",
      capacity: 180,
      maxTicketsPerOrder: 6,
      visibility: "UNLISTED",
      refundPolicy: "ON_REQUEST",
      resaleEnabled: true,
      resaleCutoffMinutes: 120,
      showResaleSection: true,
    });
    expect(
      await db.event.findUniqueOrThrow({ where: { id: e.id } }),
    ).toMatchObject({
      title: "Gala de printemps 2027",
      capacity: 180,
      maxTicketsPerOrder: 6,
      visibility: "UNLISTED",
      refundPolicy: "ON_REQUEST",
      resaleCutoffMinutes: 120,
    });
    expect((await listEvents(s.org.id)).map((x) => x.id)).toContain(e.id);
  });

  it("duplication en brouillon sans les ventes ; seul un brouillon sans commande se supprime", async () => {
    const s = await setup();
    await db.stripeAccount.create({
      data: {
        organizationId: s.org.id,
        stripeAccountId: `acct_${rid()}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
    });
    s.ctx = await s.fresh();
    const e = await createEvent(s.ctx, essentials, {
      name: "Entrée",
      price: "0",
      quantity: 50,
    });
    await publishEvent(s.ctx, e.id);
    const tt = (await getEventWithTickets(s.ctx, e.id)).ticketTypes[0]!;
    const r = await reserveOrder({
      eventId: e.id,
      lines: [{ ticketTypeId: tt.id, quantity: 2 }],
      locale: "fr",
    });
    await db.order.update({
      where: { id: r.orderId },
      data: {
        buyerEmail: `c.${rid()}@exemple.be`,
        buyerFirstName: "Alex",
        buyerLastName: "Martin",
      },
    });
    expect(await finalizeOrder(r.orderId)).toBe("PAID");
    const copy = await duplicateEvent(s.ctx, e.id);
    const c = await getEventWithTickets(s.ctx, copy.id);
    expect(c.status).toBe("DRAFT");
    expect(c.ticketTypes).toEqual([
      expect.objectContaining({
        name: "Entrée",
        quantitySold: 0,
        quantityHeld: 0,
      }),
    ]);
    await expect(deleteDraft(s.ctx, e.id)).rejects.toMatchObject({
      code: "ONLY_DRAFTS_CAN_BE_DELETED",
    });
    await deleteDraft(s.ctx, copy.id);
    expect(await db.event.findUnique({ where: { id: copy.id } })).toBeNull();
    expect(await audits(s.org.id, "event.deleted")).toBe(1);
  });
});

describe("tarifs (RG-TKT-04, RG-TKT-06)", () => {
  const input = {
    name: "VIP",
    description: "Accès carré VIP",
    price: "25",
    quantity: 40,
    minPerOrder: 1,
    maxPerOrder: 4,
    visibility: "VISIBLE" as const,
    isNominative: false,
    resaleAllowed: true,
  };
  it("création, modification, pause et archivage, ordre d'affichage, paliers de prix ; suppression refusée après une vente", async () => {
    const s = await setup();
    const e = await createEvent(s.ctx, essentials, {
      name: "Entrée",
      price: "0",
      quantity: 100,
    });
    const vip = await createTicketType(s.ctx, e.id, input);
    expect(vip).toMatchObject({
      name: "VIP",
      priceMinor: 2500,
      quantity: 40,
      maxPerOrder: 4,
    });
    await expect(
      createTicketType(s.ctx, e.id, {
        ...input,
        name: "Erreur",
        minPerOrder: 5,
        maxPerOrder: 2,
      }),
    ).rejects.toThrow();
    await expect(
      createTicketType(s.ctx, e.id, {
        ...input,
        name: "Erreur",
        price: "gratuit",
      }),
    ).rejects.toThrow();
    await updateTicketType(s.ctx, e.id, vip.id, {
      ...input,
      name: "VIP Or",
      price: "30",
    });
    expect(
      await db.ticketType.findUniqueOrThrow({ where: { id: vip.id } }),
    ).toMatchObject({ name: "VIP Or", priceMinor: 3000 });
    await setTicketTypeStatus(s.ctx, e.id, vip.id, "PAUSED");
    expect(
      (await db.ticketType.findUniqueOrThrow({ where: { id: vip.id } })).status,
    ).toBe("PAUSED");
    await setTicketTypeStatus(s.ctx, e.id, vip.id, "ACTIVE");
    const ordre = async () =>
      (await getEventWithTickets(s.ctx, e.id)).ticketTypes.map((t) => t.name);
    expect(await ordre()).toEqual(["Entrée", "VIP Or"]);
    await moveTicketType(s.ctx, e.id, vip.id, "up");
    expect(await ordre()).toEqual(["VIP Or", "Entrée"]);
    await moveTicketType(s.ctx, e.id, vip.id, "down");
    expect(await ordre()).toEqual(["Entrée", "VIP Or"]);
    // paliers de prix : fonction Pro
    await expect(
      saveTiers(s.ctx, e.id, vip.id, [{ name: "Lève-tôt", price: "20" }]),
    ).rejects.toMatchObject({ code: "PRO_REQUIRED" });
    await db.subscription.create({
      data: { organizationId: s.org.id, planId: "pro", status: "ACTIVE" },
    });
    s.ctx = await s.fresh();
    const t = await saveTiers(s.ctx, e.id, vip.id, [
      { name: "Lève-tôt", price: "20", quantityLimit: 10 },
      {
        name: "Dernière minute",
        price: "35",
        startsAtLocal: "2027-04-10T00:00",
      },
    ]);
    expect(t.issues).toEqual([]);
    expect(
      (
        await db.priceTier.findMany({
          where: { ticketTypeId: vip.id },
          orderBy: { sortOrder: "asc" },
        })
      ).map((p) => [p.name, p.priceMinor]),
    ).toEqual([
      ["Lève-tôt", 2000],
      ["Dernière minute", 3500],
    ]);
    // une vente sur l'entrée gratuite : ce tarif ne se supprime plus ; le tarif VIP, sans vente, si
    await db.stripeAccount.create({
      data: {
        organizationId: s.org.id,
        stripeAccountId: `acct_${rid()}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
    });
    s.ctx = await s.fresh();
    await publishEvent(s.ctx, e.id);
    const entree = (await getEventWithTickets(s.ctx, e.id)).ticketTypes.find(
      (x) => x.name === "Entrée",
    )!;
    const r = await reserveOrder({
      eventId: e.id,
      lines: [{ ticketTypeId: entree.id, quantity: 1 }],
      locale: "fr",
    });
    await db.order.update({
      where: { id: r.orderId },
      data: {
        buyerEmail: `c.${rid()}@exemple.be`,
        buyerFirstName: "Alex",
        buyerLastName: "Martin",
      },
    });
    await finalizeOrder(r.orderId);
    await expect(deleteTicketType(s.ctx, e.id, entree.id)).rejects.toThrow();
    await setTicketTypeStatus(s.ctx, e.id, vip.id, "ARCHIVED");
    expect(
      (await db.ticketType.findUniqueOrThrow({ where: { id: vip.id } })).status,
    ).toBe("ARCHIVED");
  });
});
