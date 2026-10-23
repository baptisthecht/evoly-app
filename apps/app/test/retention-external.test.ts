import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyRetention } from "@/server/retention";

// billets vendus par les réseaux : nom de l'acheteur anonymisé 30 jours après l'événement (décision du 22 octobre 2026)
const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
async function eventEnded(daysAgo: number) {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: `Cabaret ${id}`,
      slug: `cab-${id}`,
      subdomain: `cab-${id}`,
      country: "FR",
      currency: "EUR",
      timezone: "Europe/Paris",
      locale: "fr",
    },
  });
  const ended = new Date(Date.now() - daysAgo * DAY);
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `spectacle-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Spectacle ${id}`,
      currency: "EUR",
      timezone: "Europe/Paris",
      startsAt: new Date(ended.getTime() - 3 * 3600_000),
      endsAt: ended,
      status: "PUBLISHED",
    },
  });
  const tm = await db.distributor.create({
    data: {
      organizationId: org.id,
      kind: "TICKETMASTER",
      name: "Ticketmaster",
    },
  });
  return db.externalTicket.create({
    data: {
      eventId: event.id,
      distributorId: tm.id,
      code: `TM-${id}`,
      holderName: "Léa Martin",
      seatLabel: "C 12",
      checkedInAt: new Date(ended.getTime() - 3600_000),
    },
  });
}

describe("conservation : billets vendus par les réseaux", () => {
  it("31 jours après l'événement : nom effacé, billet et entrée gardés ; 29 jours : nom gardé ; pas compté deux fois", async () => {
    const old = await eventEnded(31);
    const recent = await eventEnded(29);
    const first = await applyRetention();
    expect(first.externalTickets).toBeGreaterThanOrEqual(1);
    const after = await db.externalTicket.findUniqueOrThrow({
      where: { id: old.id },
    });
    expect([
      after.holderName,
      after.anonymizedAt instanceof Date,
      after.code,
      after.seatLabel,
      after.checkedInAt instanceof Date,
    ]).toEqual([null, true, old.code, "C 12", true]);
    expect(
      (await db.externalTicket.findUniqueOrThrow({ where: { id: recent.id } }))
        .holderName,
    ).toBe("Léa Martin");
    await applyRetention();
    expect(
      (
        await db.externalTicket.findUniqueOrThrow({ where: { id: old.id } })
      ).anonymizedAt?.getTime(),
    ).toBe(after.anonymizedAt!.getTime());
  });
});
