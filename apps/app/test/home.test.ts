import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { OrgContext } from "@/server/context";
import { homeKpis, homeOverview } from "@/server/home";
import { createOrganization } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 8);
const DAY = 86_400_000;

/**
 * Une organisation avec des événements à venir (en vente, gratuit, brouillon), un brouillon oublié, une soirée
 * passée, et des commandes sur les deux dernières périodes de 30 jours. Dates explicites, prises sur l'horloge des
 * tests : l'horloge de la base peut avancer de quelques instants sur celle du Mac.
 */
async function orgWithActivity() {
  const base = Date.now();
  const at = (days: number) => new Date(base + days * DAY);
  const user = await db.user.create({
    data: {
      name: "Nora",
      email: `accueil.${rid()}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await createOrganization(user.id, {
    name: "Club",
    subdomain: `club-${rid()}`,
    country: "BE",
    type: "ASSOCIATION",
  } as never);
  const event = (e: {
    title: string;
    status: "PUBLISHED" | "DRAFT";
    startsAt: Date;
    publishedAt?: Date;
    locationName?: string;
    city?: string;
    coverImageUrl?: string;
    capacity?: number;
    tariffs?: {
      name: string;
      priceMinor: number;
      quantity: number | null;
      quantitySold?: number;
    }[];
  }) =>
    db.event.create({
      data: {
        organizationId: org.id,
        slug: `e-${rid()}`,
        publicCode: rid().toUpperCase(),
        currency: "EUR",
        timezone: "Europe/Brussels",
        title: e.title,
        status: e.status,
        startsAt: e.startsAt,
        publishedAt: e.publishedAt,
        locationName: e.locationName,
        city: e.city,
        coverImageUrl: e.coverImageUrl,
        capacity: e.capacity,
        ticketTypes: {
          create: (e.tariffs ?? []).map((t) => ({ ...t, currency: "EUR" })),
        },
      },
      include: { ticketTypes: true },
    });
  const gala = await event({
    title: "Gala",
    status: "PUBLISHED",
    startsAt: at(20),
    publishedAt: at(-10),
    locationName: "Salle des fêtes",
    city: "Wépion",
    tariffs: [
      { name: "Normal", priceMinor: 1000, quantity: 100, quantitySold: 30 },
      { name: "Soutien", priceMinor: 2500, quantity: 50, quantitySold: 10 },
    ],
  });
  const concert = await event({
    title: "Concert",
    status: "PUBLISHED",
    startsAt: at(40),
    publishedAt: at(-2),
    city: "Namur",
    coverImageUrl: "https://exemple.be/affiche.jpg",
    capacity: 200,
    tariffs: [{ name: "Entrée", priceMinor: 0, quantity: null }],
  });
  // brouillon daté avant le Gala : il passe quand même après les événements publiés
  const dated = await event({
    title: "Brouillon daté",
    status: "DRAFT",
    startsAt: at(10),
  });
  const stale = await event({
    title: "Vieux brouillon",
    status: "DRAFT",
    startsAt: at(-5),
  });
  await db.$executeRaw`UPDATE "Event" SET "updatedAt" = ${at(-10)} WHERE id = ${stale.id}`;
  const past = await event({
    title: "Soirée passée",
    status: "PUBLISHED",
    startsAt: at(-3),
    publishedAt: at(-50),
    coverImageUrl: "https://exemple.be/soiree.jpg",
    tariffs: [
      { name: "Entrée", priceMinor: 3000, quantity: 100, quantitySold: 1 },
    ],
  });

  const order = async (
    e: { id: string; ticketTypes: { id: string }[] },
    o: {
      status: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" | "PENDING";
      totalMinor: number;
      paidAt: Date | null;
      tickets: number;
      first?: string;
      last?: string;
      refundedMinor?: number;
      applicationFeeMinor?: number;
      paymentFeeMinor?: number;
    },
  ) => {
    const created = await db.order.create({
      data: {
        reference: `EVO-${rid()}`,
        organizationId: org.id,
        eventId: e.id,
        buyerEmail: `${rid()}@exemple.be`,
        buyerFirstName: o.first ?? "Léa",
        buyerLastName: o.last ?? "Martin",
        currency: "EUR",
        subtotalMinor: o.totalMinor,
        totalMinor: o.totalMinor,
        refundedMinor: o.refundedMinor ?? 0,
        applicationFeeMinor: o.applicationFeeMinor ?? 0,
        paymentFeeMinor: o.paymentFeeMinor ?? null,
        status: o.status,
        paidAt: o.paidAt,
        feeSnapshot: {},
        accessTokenHash: rid() + rid(),
      },
    });
    if (o.tickets === 0) return created;
    const ticketTypeId = e.ticketTypes[0]!.id;
    const item = await db.orderItem.create({
      data: {
        orderId: created.id,
        ticketTypeId,
        quantity: o.tickets,
        unitPriceMinor: o.totalMinor / o.tickets,
      },
    });
    for (let n = 0; n < o.tickets; n++)
      await db.ticket.create({
        data: {
          eventId: e.id,
          orderId: created.id,
          orderItemId: item.id,
          ticketTypeId,
          code: rid() + rid() + rid(),
          shortCode: rid(),
          faceValueMinor: o.totalMinor / o.tickets,
          status: o.status === "REFUNDED" ? "REFUNDED" : "VALID",
          createdAt: o.paidAt ?? new Date(base),
        },
      });
    return created;
  };
  await order(gala, {
    status: "PAID",
    totalMinor: 4000,
    applicationFeeMinor: 100,
    paymentFeeMinor: 60,
    paidAt: at(-1),
    tickets: 2,
  });
  // acheteur sans nom : l'accueil montre son adresse e-mail
  const anonymous = await order(gala, {
    status: "PARTIALLY_REFUNDED",
    totalMinor: 2500,
    refundedMinor: 1000,
    applicationFeeMinor: 50,
    paymentFeeMinor: 40,
    paidAt: at(-3),
    tickets: 1,
    first: "",
    last: "",
  });
  // période précédente (31 à 60 jours) : pour l'évolution des indicateurs
  await order(past, {
    status: "PAID",
    totalMinor: 3000,
    paidAt: at(-40),
    tickets: 1,
    first: "Tom",
  });
  // jamais comptées : remboursée en entier, en attente de paiement
  await order(gala, {
    status: "REFUNDED",
    totalMinor: 1500,
    refundedMinor: 1500,
    paidAt: at(-2),
    tickets: 1,
  });
  await order(gala, {
    status: "PENDING",
    totalMinor: 900,
    paidAt: null,
    tickets: 0,
  });

  const ctx = {
    organization: { id: org.id },
    stripe: null,
  } as unknown as OrgContext;
  return { ctx, at, gala, concert, dated, stale, anonymous };
}

describe("accueil de l'organisation (refonte A3, docs/DECISIONS.md)", () => {
  it("prochain événement en vente (brouillons après les événements publiés), remplissage, dernières commandes, recette des 30 jours et « À faire »", async () => {
    const s = await orgWithActivity();
    const now = new Date();
    const home = await homeOverview(s.ctx, now);

    // le Gala, pas le brouillon daté plus tôt : la jauge et les places additionnent les tarifs, l'encaissé déduit
    // les remboursements
    expect(home.next).toMatchObject({
      id: s.gala.id,
      title: "Gala",
      place: "Salle des fêtes, Wépion",
      sold: 40,
      capacity: 150,
      free: false,
      collectedMinor: 5500,
      coverImageUrl: null,
    });
    // rythme des ventes sur la période de vente : de la publication (il y a 10 jours) à la soirée (dans 20 jours)
    expect(home.next!.pace.elapsedRatio).toBeCloseTo(1 / 3, 3);
    expect(home.next!.pace.soldRatio).toBeCloseTo(40 / 150, 3);

    // les suivants : publiés d'abord, puis les brouillons ; jauge de l'événement, tarifs gratuits
    expect(home.fill.map((e) => e.title)).toEqual([
      "Concert",
      "Brouillon daté",
    ]);
    expect(home.fill[0]).toMatchObject({
      id: s.concert.id,
      place: "Namur",
      sold: 0,
      capacity: 200,
      free: true,
      collectedMinor: 0,
    });
    expect(home.fill[1]).toMatchObject({ id: s.dated.id, status: "DRAFT" });

    // payées ou remboursées en partie, la plus récente d'abord, avec le nombre de billets
    expect(
      home.recent.map((o) => [o.name, o.event, o.tickets, o.totalMinor]),
    ).toEqual([
      ["Léa Martin", "Gala", 2, 4000],
      [s.anonymous.buyerEmail, "Gala", 1, 2500],
      ["Tom Martin", "Soirée passée", 1, 3000],
    ]);

    // 30 jours jusqu'à aujourd'hui, remboursements déduits ; la période précédente n'y est pas
    expect(home.revenue).toHaveLength(30);
    expect(home.revenue.at(-1)!.day).toBe(now.toISOString().slice(0, 10));
    const day = (d: Date) =>
      home.revenue.find((r) => r.day === d.toISOString().slice(0, 10))
        ?.totalMinor;
    expect([day(s.at(-1)), day(s.at(-3))]).toEqual([4000, 1500]);
    expect(home.revenue.reduce((n, r) => n + r.totalMinor, 0)).toBe(5500);

    // à faire : Stripe à connecter, image manquante d'un événement en vente, brouillon oublié depuis 10 jours
    expect(home.todo).toEqual({
      stripe: true,
      noCover: [{ id: s.gala.id, title: "Gala" }],
      drafts: [{ id: s.stale.id, title: "Vieux brouillon", days: 10 }],
    });
    const active = {
      ...s.ctx,
      stripe: { status: "ACTIVE" },
    } as unknown as OrgContext;
    expect((await homeOverview(active, now)).todo.stripe).toBe(false);
  });

  it("indicateurs : recette nette et billets sur 30 jours avec l'écart à la période précédente, événements en vente, brouillons", async () => {
    const s = await orgWithActivity();
    // recette nette : total moins remboursements, commission et frais de paiement (3 840 + 1 410) ; la période
    // précédente : 3 000. Billets valides : 3 contre 1. Les commandes remboursées ou en attente ne comptent pas.
    expect(await homeKpis(s.ctx, new Date())).toEqual({
      events: 3,
      drafts: 2,
      netMinor: 5250,
      netDeltaMinor: 2250,
      tickets: 3,
      ticketsDelta: 2,
    });
  });
});
