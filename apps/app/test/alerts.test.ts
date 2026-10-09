import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { alertByToken, sendSalesOpenAlerts, subscribeAlert, unsubscribeAlert, waitingAlerts } from "@/server/alerts";
import { googleCalendarUrl, openingCalendar, openingIcs } from "@/server/calendar";

const rid = () => Math.random().toString(36).slice(2, 10);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function setup(o: { publishAt: Date | null; mode?: "HIDDEN" | "TEASER" }) {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala secret ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: days(30),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      publishAt: o.publishAt,
      prePublishMode: o.mode ?? "TEASER",
      teaserText: "Grande annonce",
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50, sortOrder: 0 }] },
    },
  });
  return { org, event };
}

describe("« Prévenez-moi » et ajout à l'agenda (RG-PRG-04, RG-PRG-05)", () => {
  it("une inscription par adresse ; refusée pour un événement invisible ou déjà en vente", async () => {
    const teaser = await setup({ publishAt: days(2) });
    await subscribeAlert(teaser.event.id, "lea@exemple.be", "fr");
    await subscribeAlert(teaser.event.id, "lea@exemple.be", "en");
    expect(await waitingAlerts(teaser.event.id)).toBe(1);
    const hidden = await setup({ publishAt: days(2), mode: "HIDDEN" });
    await expect(subscribeAlert(hidden.event.id, "lea@exemple.be", "fr")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const open = await setup({ publishAt: null });
    await expect(subscribeAlert(open.event.id, "lea@exemple.be", "fr")).rejects.toMatchObject({ code: "SALES_ALREADY_OPEN" });
  });

  it("un seul e-mail, à l'ouverture des ventes, dans la langue de l'inscrit ; purge 30 jours après", async () => {
    const { org, event } = await setup({ publishAt: days(2) });
    await subscribeAlert(event.id, "ana@exemple.es", "es");
    await sendSalesOpenAlerts();
    const sent = () => db.emailMessage.findMany({ where: { organizationId: org.id, template: "alert.sales_open" }, select: { toEmail: true } });
    expect(await sent()).toHaveLength(0);
    await db.event.update({ where: { id: event.id }, data: { publishAt: new Date(Date.now() - 1000) } });
    await sendSalesOpenAlerts();
    await sendSalesOpenAlerts();
    expect((await sent()).map((m) => m.toEmail)).toEqual(["ana@exemple.es"]);
    expect(await waitingAlerts(event.id)).toBe(0);
    await db.eventAlert.updateMany({ where: { eventId: event.id }, data: { notifiedAt: days(-31) } });
    await sendSalesOpenAlerts();
    expect(await db.eventAlert.count({ where: { eventId: event.id } })).toBe(0);
  });

  it("désinscription par le lien de l'e-mail", async () => {
    const { event } = await setup({ publishAt: days(2) });
    await subscribeAlert(event.id, "tom@exemple.be", "fr");
    const { token } = await db.eventAlert.findFirstOrThrow({ where: { eventId: event.id } });
    expect(await alertByToken(token)).not.toBeNull();
    await unsubscribeAlert(token);
    expect(await alertByToken(token)).toBeNull();
  });

  it("agenda : titre masqué avant publication, rien pour un événement invisible, fichier conforme", async () => {
    const teaser = await setup({ publishAt: days(2) });
    const cal = await openingCalendar(teaser.event.id, "fr");
    expect(cal!.title).toBe(`Grande annonce · ${teaser.org.name}`);
    expect(cal!.title).not.toContain("Gala secret");
    expect(cal!.start.getTime()).toBe(teaser.event.publishAt!.getTime());
    const hidden = await setup({ publishAt: days(2), mode: "HIDDEN" });
    expect(await openingCalendar(hidden.event.id, "fr")).toBeNull();
    const ics = openingIcs({ uid: "u1", title: "Soirée, gala; test", start: new Date("2026-11-14T20:00:00Z"), url: `https://exemple.be/${"x".repeat(120)}` });
    expect(ics).toContain("SUMMARY:Soirée\\, gala\\; test");
    expect(ics).toContain("DTSTART:20261114T200000Z");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
    expect(googleCalendarUrl({ title: "Ouverture", start: new Date("2026-11-14T20:00:00Z"), url: "https://exemple.be" })).toContain(
      "dates=20261114T200000Z%2F20261114T203000Z",
    );
  });
});
