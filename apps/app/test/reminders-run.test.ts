import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runDueReminders } from "@/server/automations";
import { reserveOrder, submitBuyer } from "@/server/checkout";

// tâche des rappels (US-MKT-01, RG-MKT-06) : dans la langue de l'acheteur, jamais deux fois, ni annulé ni offre gratuite
// date de référence en 2031 : la tâche ne voit que les événements de ce test
const base = new Date("2031-03-10T10:00:00Z");
const rid = () => Math.random().toString(36).slice(2, 10);
async function event(
  o: { pro?: boolean; status?: "PUBLISHED" | "CANCELLED" } = {},
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
  if (o.pro !== false)
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date("2032-01-01T00:00:00Z"),
      },
    });
  const e = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(base.getTime() + 20 * 3600_000),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      locationName: "Salle des fêtes",
      city: "Mouscron",
      ticketTypes: {
        create: [
          {
            name: "Entrée",
            priceMinor: 0,
            currency: "EUR",
            quantity: 100,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });
  const buy = async (locale: string) => {
    const r = await reserveOrder({
      eventId: e.id,
      lines: [{ ticketTypeId: e.ticketTypes[0]!.id, quantity: 1 }],
      locale,
    });
    await submitBuyer(r.token, {
      firstName: "Léa",
      lastName: "Martin",
      email: `lea.${locale}.${rid()}@exemple.be`,
      marketingOptIn: false,
    });
    return db.order.findFirstOrThrow({
      where: { eventId: e.id },
      orderBy: { createdAt: "desc" },
    });
  };
  const fr = await buy("fr");
  const nl = await buy("nl");
  if (o.status === "CANCELLED")
    await db.event.update({
      where: { id: e.id },
      data: { status: "CANCELLED" },
    });
  return { event: e, orders: [fr, nl] };
}
const reminders = (orderIds: string[]) =>
  db.emailMessage.findMany({
    where: { orderId: { in: orderIds }, automationId: { not: null } },
    orderBy: { queuedAt: "asc" },
  });

describe("tâche des rappels", () => {
  it("rappel dans la langue de chaque acheteur (néerlandais compris) ; une seconde exécution n'envoie rien en double", async () => {
    const { orders } = await event();
    await runDueReminders(base);
    const first = await reminders(orders.map((o) => o.id));
    expect(first.length).toBeGreaterThan(0);
    const byOrder = (id: string) => first.filter((m) => m.orderId === id);
    expect(byOrder(orders[0]!.id).every((m) => m.locale === "fr")).toBe(true);
    expect(byOrder(orders[1]!.id).every((m) => m.locale === "nl")).toBe(true);
    expect(byOrder(orders[1]!.id)[0]!.subject).not.toBe(
      byOrder(orders[0]!.id)[0]!.subject,
    );
    await runDueReminders(base);
    expect(await reminders(orders.map((o) => o.id))).toHaveLength(first.length);
  });

  it("événement annulé ou organisation en offre gratuite : aucun rappel", async () => {
    const cancelled = await event({ status: "CANCELLED" });
    const free = await event({ pro: false });
    await runDueReminders(base);
    expect(
      await reminders([...cancelled.orders, ...free.orders].map((o) => o.id)),
    ).toHaveLength(0);
  });
});
