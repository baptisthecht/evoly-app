import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("e-mail de chaque titulaire (RG-QST-01)", () => {
  it("exigé quand le tarif le demande, enregistré sur chaque billet", async () => {
    const id = rid();
    const org = await db.organization.create({
      data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
    });
    const event = await db.event.create({
      data: {
        organizationId: org.id,
        slug: `atelier-${id}`,
        publicCode: id.toUpperCase().slice(0, 8),
        title: `Atelier ${id}`,
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 6 * 86_400_000),
        status: "PUBLISHED",
        ticketTypes: { create: { name: "Place", priceMinor: 0, currency: "EUR", quantity: 20, isNominative: true, requireHolderEmail: true } },
      },
      include: { ticketTypes: true },
    });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 2 }], locale: "fr" });
    const item = (await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } })).id;
    const buyer = { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false };
    await expect(
      submitBuyer(r.token, {
        ...buyer,
        holders: {
          [item]: [
            { firstName: "Léa", lastName: "Martin" },
            { firstName: "Tom", lastName: "Dubois" },
          ],
        },
      }),
    ).rejects.toThrow("HOLDER_EMAIL_REQUIRED");
    await expect(
      submitBuyer(r.token, {
        ...buyer,
        holders: {
          [item]: [
            { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be` },
            { firstName: "Tom", lastName: "Dubois", email: "pas-une-adresse" },
          ],
        },
      }),
    ).rejects.toThrow("HOLDER_EMAIL_REQUIRED");
    await submitBuyer(r.token, {
      ...buyer,
      holders: {
        [item]: [
          { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be` },
          { firstName: "Tom", lastName: "Dubois", email: ` Tom.${id}@Exemple.BE ` },
        ],
      },
    });
    const tickets = await db.ticket.findMany({ where: { orderId: r.orderId }, orderBy: { createdAt: "asc" } });
    expect(tickets.map((t) => [t.holderFirstName, t.holderEmail]).sort()).toEqual([
      ["Léa", `lea.${id}@exemple.be`],
      ["Tom", `tom.${id}@exemple.be`],
    ]);
  });
});
