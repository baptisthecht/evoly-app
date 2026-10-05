import { describe, expect, it } from "vitest";
import { reminderSendAt } from "@evoly/core";
import { db } from "@/lib/db";
import { runDueReminders } from "@/server/automations";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { applyUnsubscribe, mayReceive, readUnsubscribeToken, unsubscribeToken } from "@/server/unsubscribe";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(plan: "free" | "pro" = "pro") {
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
      addressLine1: "Rue Haute 1",
      postalCode: "1000",
      city: "Bruxelles",
    },
  });
  if (plan === "pro")
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) },
    });
  const startsAt = new Date(Math.ceil((Date.now() + 3 * 86_400_000) / 3_600_000) * 3_600_000);
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `bal-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Bal ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt,
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50 } },
    },
    include: { ticketTypes: true },
  });
  const buyers = [`lea.${id}@exemple.be`, `tom.${id}@exemple.be`];
  for (const [i, email] of buyers.entries()) {
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: i ? "Tom" : "Léa", lastName: "Martin", email, marketingOptIn: i === 0 });
  }
  const j1 = new Date(reminderSendAt(startsAt, "Europe/Brussels", "REMINDER_J1").getTime() + 60_000);
  return { id, org, event, buyers, j1 };
}
const sentTo = (automationTemplate: string, organizationId: string) =>
  db.emailMessage.findMany({ where: { organizationId, template: automationTemplate }, select: { toEmail: true } });

describe("désinscription et consentement (US-MKT-05, RG-MKT-01)", () => {
  it("lien signé : falsification refusée ; désinscription de l'organisation retire le consentement", async () => {
    const s = await setup();
    const token = unsubscribeToken(s.buyers[0]!, s.org.id, s.event.id);
    expect(readUnsubscribeToken(token)).toEqual({ email: s.buyers[0], organizationId: s.org.id, eventId: s.event.id, campaignId: null });
    expect(readUnsubscribeToken(`${token.split(".")[0]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
    expect(await mayReceive(s.buyers[0]!, "MARKETING", s.org.id)).toBe(true);
    expect(await mayReceive(s.buyers[1]!, "MARKETING", s.org.id)).toBe(false); // sans consentement
    await applyUnsubscribe(token, "ORGANIZATION");
    expect(await mayReceive(s.buyers[0]!, "MARKETING", s.org.id)).toBe(false);
    expect(await mayReceive(s.buyers[0]!, "SERVICE", s.org.id, s.event.id)).toBe(true); // les rappels respectent la désinscription de l'événement
    expect(await mayReceive(s.buyers[0]!, "TRANSACTIONAL", s.org.id)).toBe(true);
    await applyUnsubscribe(token, "EVENT");
    expect(await mayReceive(s.buyers[0]!, "SERVICE", s.org.id, s.event.id)).toBe(false);
    const contact = await db.contact.findFirstOrThrow({ where: { organizationId: s.org.id, email: s.buyers[0] } });
    expect(contact).toMatchObject({ marketingConsent: false });
    expect(contact.unsubscribedAt).not.toBeNull();
  });
});

describe("rappels automatiques (US-MKT-01, RG-MKT-06)", () => {
  it("une fois par commande, à l'heure prévue, sans les désinscrits de l'événement", async () => {
    const s = await setup();
    await applyUnsubscribe(unsubscribeToken(s.buyers[1]!, s.org.id, s.event.id), "EVENT");
    // la tâche traite toute la plateforme : on vérifie les envois de cette organisation, pas le total
    await runDueReminders(new Date(s.j1.getTime() - 120_000));
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "automation.reminder_j1" } })).toBe(0);
    await runDueReminders(s.j1);
    expect((await sentTo("automation.reminder_j1", s.org.id)).map((m) => m.toEmail)).toEqual([s.buyers[0]]);
    await runDueReminders(new Date(s.j1.getTime() + 15 * 60_000));
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "automation.reminder_j1" } })).toBe(1);
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "automation.reminder_j7" } })).toBe(0); // J-7 déjà passé depuis longtemps
  });

  it("aucun rappel pour un événement annulé, un rappel désactivé ou une organisation en Free", async () => {
    const cancelled = await setup();
    await db.event.update({ where: { id: cancelled.event.id }, data: { status: "CANCELLED" } });
    await runDueReminders(cancelled.j1);
    const off = await setup();
    await runDueReminders(new Date(off.j1.getTime() - 3 * 86_400_000)); // crée les rappels
    await db.emailAutomation.updateMany({ where: { eventId: off.event.id, type: "REMINDER_J1" }, data: { enabled: false } });
    await runDueReminders(off.j1);
    const free = await setup("free");
    await runDueReminders(free.j1);
    for (const s of [cancelled, off, free])
      expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: { startsWith: "automation." } } })).toBe(0);
  });
});
