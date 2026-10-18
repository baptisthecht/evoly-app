import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { listEvents } from "@/server/events";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("liste des événements de l'organisation : places vendues et total", () => {
  it("total : la jauge si elle existe, sinon la somme des tarifs limités, sinon illimité", async () => {
    const id = rid();
    const org = await db.organization.create({ data: { name: "Club", slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR" } });
    const ev = (n: number, capacity: number | null, types: Array<{ quantity: number | null; sold: number }>) =>
      db.event.create({
        data: {
          organizationId: org.id,
          slug: `ev${n}-${id}`,
          publicCode: `${n}${id}`.toUpperCase().slice(0, 8),
          title: `Événement ${n}`,
          currency: "EUR",
          timezone: "Europe/Brussels",
          startsAt: new Date(Date.now() + n * 86_400_000),
          capacity,
          ticketTypes: {
            create: types.map((t, i) => ({ name: `T${i}`, priceMinor: 0, currency: "EUR", quantity: t.quantity, quantitySold: t.sold, sortOrder: i })),
          },
        },
      });
    const withCapacity = await ev(1, 100, [
      { quantity: 80, sold: 12 },
      { quantity: 50, sold: 3 },
    ]);
    const limited = await ev(2, null, [
      { quantity: 30, sold: 5 },
      { quantity: 20, sold: 0 },
    ]);
    const unlimited = await ev(3, null, [
      { quantity: 30, sold: 7 },
      { quantity: null, sold: 1 },
    ]);
    const rows = await listEvents(org.id);
    const by = (e: { id: string }) => rows.find((r) => r.id === e.id)!;
    expect([by(withCapacity).sold, by(withCapacity).total]).toEqual([15, 100]);
    expect([by(limited).sold, by(limited).total]).toEqual([5, 50]);
    expect([by(unlimited).sold, by(unlimited).total]).toEqual([8, null]);
    expect(rows.map((r) => r.id)).toEqual([withCapacity.id, limited.id, unlimited.id]); // dans l'ordre des dates
  });
});
