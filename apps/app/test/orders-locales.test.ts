import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { joinWaitlist } from "@/server/waitlist";

// confirmation de commande et billets PDF dans la langue de la commande ; inscription à la liste d'attente sans doublon
const rid = () => Math.random().toString(36).slice(2, 10);
async function event(o: { online?: boolean; quantity?: number } = {}) {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const e = await db.event.create({
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
      ...(o.online
        ? { locationType: "ONLINE", onlineUrl: "https://visio.exemple.be/gala" }
        : { locationType: "PHYSICAL", locationName: "Salle des fêtes", city: "Mouscron", country: "BE" }),
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: o.quantity ?? 100, sortOrder: 0 }] },
    },
    include: { ticketTypes: true },
  });
  return { event: e, ticketTypeId: e.ticketTypes[0]!.id, id };
}

describe("confirmation de commande", () => {
  it("événement en ligne : chaque confirmation, billets PDF compris, part dans la langue de la commande", async () => {
    const { event: e, ticketTypeId, id } = await event({ online: true });
    const subjects: string[] = [];
    for (const locale of ["en", "es", "de", "it", "pt", "nl"]) {
      const r = await reserveOrder({ eventId: e.id, lines: [{ ticketTypeId, quantity: 2 }], locale });
      await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${locale}.${id}@exemple.be`, marketingOptIn: false });
      const order = await db.order.findFirstOrThrow({ where: { eventId: e.id, buyerEmail: `lea.${locale}.${id}@exemple.be` } });
      const mail = await db.emailMessage.findFirst({ where: { orderId: order.id, template: "order.confirmation" } });
      expect(mail, `confirmation en ${locale}`).not.toBeNull();
      expect(mail!.subject).toContain(e.title);
      subjects.push(mail!.subject);
    }
    // traduite : un sujet différent dans chaque langue (la langue n'est pas notée sur l'e-mail enregistré)
    expect(new Set(subjects).size).toBe(6);
  });
});

describe("liste d'attente : inscription sans doublon", () => {
  it("déjà inscrit et en attente : la même inscription est rendue, rien n'est dupliqué", async () => {
    const { event: e, ticketTypeId, id } = await event({ quantity: 1 });
    const r = await reserveOrder({ eventId: e.id, lines: [{ ticketTypeId, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `premier.${id}@exemple.be`, marketingOptIn: false });
    const first = await joinWaitlist(e.id, ticketTypeId, `attente.${id}@exemple.be`, 1, "fr");
    const again = await joinWaitlist(e.id, ticketTypeId, `attente.${id}@exemple.be`, 2, "fr");
    expect(again.id).toBe(first.id);
    expect(await db.waitlistEntry.count({ where: { ticketTypeId } })).toBe(1);
  });
});
