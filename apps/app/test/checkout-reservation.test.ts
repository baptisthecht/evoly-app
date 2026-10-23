import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cancelReservation,
  CartRejected,
  reservationByToken,
  reserveOrder,
  submitBuyer,
} from "@/server/checkout";

// cycle d'une réservation : récapitulatif par jeton, expiration, annulation, coordonnées, stock épuisé
const rid = () => Math.random().toString(36).slice(2, 10);
const buyer = (email: string, extra: Record<string, unknown> = {}) => ({
  firstName: "Léa",
  lastName: "Martin",
  email,
  marketingOptIn: false,
  ...extra,
});
async function setup(
  o: { quantity?: number; requireBuyerPhone?: boolean } = {},
) {
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
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      requireBuyerPhone: o.requireBuyerPhone ?? false,
      ticketTypes: {
        create: [
          {
            name: "Entrée",
            priceMinor: 0,
            currency: "EUR",
            quantity: o.quantity ?? 100,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });
  return {
    event,
    ticketTypeId: event.ticketTypes[0]!.id,
    email: `lea.${id}@exemple.be`,
  };
}
const refused = (code: string) => expect.objectContaining({ code });
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

describe("réservation : récapitulatif par jeton", () => {
  it("jeton inconnu ou réservation expirée : rien ; valide : lignes et gratuité ; annulée : rien", async () => {
    const { event, ticketTypeId } = await setup();
    expect(await reservationByToken("jeton-inconnu")).toBeNull();
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 2 }],
      locale: "fr",
    });
    const view = await reservationByToken(r.token);
    expect(view).toMatchObject({
      isFree: true,
      totalMinor: 0,
      stripeAccountId: null,
    });
    expect(view!.lines).toEqual([
      expect.objectContaining({
        ticketTypeId,
        quantity: 2,
        name: "Entrée",
        nominative: false,
      }),
    ]);
    expect(await reservationByToken(r.token, later(24 * 60))).toBeNull(); // bien après l'expiration du panier
    await cancelReservation(r.token);
    expect(await reservationByToken(r.token)).toBeNull();
    expect(
      (await db.order.findFirstOrThrow({ where: { eventId: event.id } }))
        .status,
    ).not.toBe("PENDING");
  });
});

describe("réservation : annulation", () => {
  it("jeton inconnu : sans effet ; commande déjà payée : reste payée et garde ses billets", async () => {
    const { event, ticketTypeId, email } = await setup();
    await expect(cancelReservation("jeton-inconnu")).resolves.toBeUndefined();
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 1 }],
      locale: "fr",
    });
    await submitBuyer(r.token, buyer(email));
    await cancelReservation(r.token);
    const order = await db.order.findFirstOrThrow({
      where: { eventId: event.id },
    });
    expect(order.status).toBe("PAID");
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(1);
  });
});

describe("réservation : coordonnées de l'acheteur", () => {
  it("commande inconnue refusée ; déjà payée : reconnue ; réservation expirée : refusée", async () => {
    const { event, ticketTypeId, email } = await setup();
    await expect(submitBuyer("jeton-inconnu", buyer(email))).rejects.toEqual(
      refused("ORDER_NOT_FOUND"),
    );
    const paid = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 1 }],
      locale: "fr",
    });
    await submitBuyer(paid.token, buyer(email));
    expect(await submitBuyer(paid.token, buyer(email))).toEqual({
      kind: "PAID",
    });
    const late = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 1 }],
      locale: "fr",
    });
    await expect(
      submitBuyer(late.token, buyer(email), later(24 * 60)),
    ).rejects.toEqual(refused("HOLD_EXPIRED"));
  });

  it("téléphone exigé par l'événement : refusé sans, accepté avec", async () => {
    const { event, ticketTypeId, email } = await setup({
      requireBuyerPhone: true,
    });
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 1 }],
      locale: "fr",
    });
    await expect(submitBuyer(r.token, buyer(email))).rejects.toEqual(
      refused("PHONE_REQUIRED"),
    );
    await expect(
      submitBuyer(r.token, buyer(email, { phone: "+32470123456" })),
    ).resolves.toBeTruthy();
  });
});

describe("réservation : stock épuisé", () => {
  it("au-delà du stock restant, la réservation est refusée ; le stock libéré redevient disponible", async () => {
    const { event, ticketTypeId } = await setup({ quantity: 2 });
    const first = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 2 }],
      locale: "fr",
    });
    await expect(
      reserveOrder({
        eventId: event.id,
        lines: [{ ticketTypeId, quantity: 1 }],
        locale: "fr",
      }),
    ).rejects.toBeInstanceOf(CartRejected);
    await cancelReservation(first.token);
    await expect(
      reserveOrder({
        eventId: event.id,
        lines: [{ ticketTypeId, quantity: 1 }],
        locale: "fr",
      }),
    ).resolves.toBeTruthy();
  });
});
