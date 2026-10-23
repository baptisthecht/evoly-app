import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createEvent, publishEvent } from "@/server/events";
import {
  createOption,
  redeemOption,
  setOptionActive,
  updateOption,
} from "@/server/options";
import { joinWaitlist } from "@/server/waitlist";

// options et consommations prépayées (section 9.29, RG-OPT) et liste d'attente (section 9.30) : règles refusées
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
async function setup(o: { pro?: boolean; quantity?: number } = {}) {
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
  if (o.pro !== false)
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000),
      },
    });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  const event = await createEvent(ctx, essentials, {
    name: "Entrée",
    price: "0",
    quantity: o.quantity ?? 100,
  });
  await publishEvent(ctx, event.id);
  const ticketTypeId = (
    await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })
  ).id;
  return { ctx, event, ticketTypeId, id };
}
const option = (o: Record<string, unknown> = {}) =>
  ({ name: "Boisson", price: "0", stock: "", maxPerOrder: "4", ...o }) as never;
const refused = (code: string) => expect.objectContaining({ code });
const buyer = (email: string) => ({
  firstName: "Léa",
  lastName: "Martin",
  email,
  marketingOptIn: false,
});

describe("options : création et modification", () => {
  it("offre gratuite : indisponible ; nom, prix, stock ou maximum invalides refusés ; option inconnue introuvable", async () => {
    const free = await setup({ pro: false });
    await expect(
      createOption(free.ctx, free.event.id, option()),
    ).rejects.toEqual(refused("FEATURE_UNAVAILABLE"));
    const { ctx, event } = await setup();
    await expect(
      createOption(ctx, event.id, option({ name: "   " })),
    ).rejects.toEqual(refused("OPTION_NAME_REQUIRED"));
    for (const price of ["gratuit", "-1"])
      await expect(
        createOption(ctx, event.id, option({ price })),
      ).rejects.toEqual(refused("OPTION_PRICE_INVALID"));
    for (const stock of ["1.5", "-2"])
      await expect(
        createOption(ctx, event.id, option({ stock })),
      ).rejects.toEqual(refused("OPTION_STOCK_INVALID"));
    for (const maxPerOrder of ["0", "101"])
      await expect(
        createOption(ctx, event.id, option({ maxPerOrder })),
      ).rejects.toEqual(refused("OPTION_MAX_INVALID"));
    await expect(
      updateOption(ctx, event.id, "option-inconnue", option()),
    ).rejects.toEqual(refused("NOT_FOUND"));
    await expect(
      setOptionActive(ctx, event.id, "option-inconnue", false),
    ).rejects.toEqual(refused("NOT_FOUND"));
  });
});

describe("options : dans une commande", () => {
  it("quantité invalide, option inconnue ou retirée, maximum dépassé, stock épuisé, option seule qui demande un billet", async () => {
    const { ctx, event, ticketTypeId } = await setup();
    const drink = await createOption(
      ctx,
      event.id,
      option({ stock: "2", maxPerOrder: "2" }),
    );
    const lines = [{ ticketTypeId, quantity: 1 }];
    const reserve = (
      options: Array<{ optionId: string; quantity: number }>,
      withTicket = true,
    ) =>
      reserveOrder({
        eventId: event.id,
        lines: withTicket ? lines : [],
        locale: "fr",
        options,
      });
    await expect(
      reserve([{ optionId: drink.id, quantity: 101 }]),
    ).rejects.toEqual(refused("OPTION_QUANTITY_INVALID"));
    await expect(
      reserve([{ optionId: "option-inconnue", quantity: 1 }]),
    ).rejects.toEqual(refused("OPTION_UNAVAILABLE"));
    await expect(
      reserve([{ optionId: drink.id, quantity: 3 }]),
    ).rejects.toEqual(refused("OPTION_MAX_EXCEEDED"));
    await expect(
      reserve([{ optionId: drink.id, quantity: 1 }], false),
    ).rejects.toEqual(refused("OPTION_NEEDS_TICKET"));
    await reserve([{ optionId: drink.id, quantity: 2 }]); // le stock de 2 est retenu
    await expect(
      reserve([{ optionId: drink.id, quantity: 1 }]),
    ).rejects.toEqual(refused("OPTION_SOLD_OUT"));
    await setOptionActive(ctx, event.id, drink.id, false);
    await expect(
      reserve([{ optionId: drink.id, quantity: 1 }]),
    ).rejects.toEqual(refused("OPTION_UNAVAILABLE"));
  });

  it("retrait au bar : quantité invalide refusée ; jamais plus que ce qui a été acheté", async () => {
    const { ctx, event, ticketTypeId, id } = await setup();
    const drink = await createOption(ctx, event.id, option());
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 1 }],
      locale: "fr",
      options: [{ optionId: drink.id, quantity: 2 }],
    });
    await submitBuyer(r.token, buyer(`bar.${id}@exemple.be`));
    const line = await db.orderOption.findFirstOrThrow({
      where: { optionId: drink.id },
    });
    await expect(redeemOption(event.id, line.id, 0)).rejects.toEqual(
      refused("OPTION_QUANTITY_INVALID"),
    );
    expect(
      await redeemOption(event.id, line.id, 2, { staffName: "Bar" }),
    ).toEqual({ left: 0 });
    await expect(redeemOption(event.id, line.id, 1)).rejects.toEqual(
      refused("OPTION_NOT_REDEEMABLE"),
    );
    expect(
      await db.optionRedemption.count({ where: { orderOptionId: line.id } }),
    ).toBe(1);
  });
});

describe("liste d'attente : inscription", () => {
  it("tarif inconnu, plus de 4 places ou places encore disponibles : refusé ; tarif complet : inscrit", async () => {
    const { event, ticketTypeId, id } = await setup({ quantity: 1 });
    await expect(
      joinWaitlist(event.id, "tarif-inconnu", `a.${id}@exemple.be`, 1, "fr"),
    ).rejects.toEqual(refused("NOT_FOUND"));
    await expect(
      joinWaitlist(event.id, ticketTypeId, `a.${id}@exemple.be`, 5, "fr"),
    ).rejects.toEqual(refused("WAITLIST_QUANTITY_INVALID"));
    await expect(
      joinWaitlist(event.id, ticketTypeId, `a.${id}@exemple.be`, 1, "fr"),
    ).rejects.toEqual(refused("WAITLIST_NOT_SOLD_OUT"));
    const r = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 1 }],
      locale: "fr",
    });
    await submitBuyer(r.token, buyer(`premier.${id}@exemple.be`));
    await joinWaitlist(
      event.id,
      ticketTypeId,
      `attente.${id}@exemple.be`,
      1,
      "fr",
    );
    expect(
      await db.waitlistEntry.count({
        where: { ticketTypeId, status: "WAITING" },
      }),
    ).toBe(1);
  });
});
