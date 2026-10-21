import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { createListing } from "@/server/resale";

// mise en revente d'un billet par son acheteur (section 9.13, RG-RSL-01 à 05) : refus avant toute annonce
const rid = () => Math.random().toString(36).slice(2, 10);
async function bought(o: { resaleEnabled?: boolean } = {}) {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
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
      resaleEnabled: o.resaleEnabled ?? true,
      resaleCutoffMinutes: 120,
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 0, resaleAllowed: true }] },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
  await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false });
  const ticket = await db.ticket.findFirstOrThrow({ where: { eventId: event.id } });
  return { token: r.token, ticket, event };
}
const refused = (code: string | RegExp) => expect.objectContaining({ code: typeof code === "string" ? code : expect.stringMatching(code) });

describe("revente : refus avant toute annonce", () => {
  it("lien inconnu : commande introuvable ; billet d'une autre commande : introuvable", async () => {
    const a = await bought();
    const b = await bought();
    await expect(createListing("jeton-inconnu", a.ticket.id, "0")).rejects.toEqual(refused("ORDER_NOT_FOUND"));
    await expect(createListing(a.token, b.ticket.id, "0")).rejects.toEqual(refused("NOT_FOUND"));
  });

  it("prix illisible refusé ; prix au-dessus de la valeur faciale refusé", async () => {
    const { token, ticket } = await bought();
    await expect(createListing(token, ticket.id, "beaucoup")).rejects.toEqual(refused("INVALID_PRICE"));
    await expect(createListing(token, ticket.id, "5")).rejects.toEqual(refused(/^RESALE_/));
    expect(await db.resaleListing.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("revente coupée sur l'événement : refusée", async () => {
    const { token, ticket } = await bought({ resaleEnabled: false });
    await expect(createListing(token, ticket.id, "0")).rejects.toEqual(refused(/^RESALE_/));
  });

  it("billet déjà en vente : une seconde annonce est refusée", async () => {
    const { token, ticket } = await bought();
    await createListing(token, ticket.id, "0");
    await expect(createListing(token, ticket.id, "0")).rejects.toEqual(refused(/^RESALE_/));
    expect(await db.resaleListing.count({ where: { ticketId: ticket.id } })).toBe(1);
  });
});
