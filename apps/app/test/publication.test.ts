import { describe, expect, it } from "vitest";
import { utcToZonedLocal } from "@evoly/core";
import { db } from "@/lib/db";
import { CartRejected, reserveOrder } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { listPublicEvents, loadPublicEvent } from "@/server/publicEvents";
import { createPreviewToken, notifyPublishedEvents, previewAllowed, revokePreviewToken, savePublication } from "@/server/publication";

const rid = () => Math.random().toString(36).slice(2, 10);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const TZ = "Europe/Brussels";

async function setup() {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: TZ, locale: "fr" },
  });
  for (const k of ["OWNER", "ADMIN"] as const) {
    const role = await db.role.findFirstOrThrow({ where: { systemKey: k } });
    const u = await db.user.create({ data: { name: k, email: `${k.toLowerCase()}.${id}@exemple.be`, emailVerified: true } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: u.id, roleId: role.id } });
  }
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: TZ,
      startsAt: days(30),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50, sortOrder: 0 }] },
    },
    include: { ticketTypes: true },
  });
  return { org, event, ctx: { organization: org } as unknown as OrgContext };
}
const listed = async (orgId: string, eventId: string) => {
  const { upcoming, past } = await listPublicEvents(orgId);
  return [...upcoming, ...past].some((e) => e.id === eventId);
};

describe("publication programmée (RG-PRG-01 à 03)", () => {
  it("refuse une publication après le début de l'événement", async () => {
    const { event, ctx } = await setup();
    await expect(savePublication(ctx, event.id, { publishLocal: utcToZonedLocal(days(31), TZ), mode: "HIDDEN", teaserText: null })).rejects.toMatchObject({
      code: "PUBLISH_AFTER_START",
    });
  });

  it("avant la date : hors de la liste, rien en vente, réservation refusée par le serveur ; à l'heure dite : public et en vente", async () => {
    const { org, event, ctx } = await setup();
    await savePublication(ctx, event.id, { publishLocal: utcToZonedLocal(days(2), TZ), mode: "TEASER", teaserText: "  Bientôt  " });
    const before = await loadPublicEvent({ organizationId: org.id, slug: event.slug });
    expect(before!.prepublished).toBe(true);
    expect(before!.salesOpen).toBe(false);
    expect(before!.ticketTypes.every((t) => !t.onSale)).toBe(true);
    expect(before!.event.teaserText).toBe("Bientôt");
    expect(await listed(org.id, event.id)).toBe(false);
    await expect(reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" })).rejects.toBeInstanceOf(
      CartRejected,
    );
    await db.event.update({ where: { id: event.id }, data: { publishAt: new Date(Date.now() - 1000) } });
    const after = await loadPublicEvent({ id: event.id });
    expect(after!.prepublished).toBe(false);
    expect(after!.salesOpen).toBe(true);
    expect(await listed(org.id, event.id)).toBe(true);
    await expect(reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" })).resolves.toBeTruthy();
  });

  it("lien d'aperçu : seul le jeton exact donne accès, et il se désactive", async () => {
    const { event, ctx } = await setup();
    const token = await createPreviewToken(ctx, event.id);
    expect(await createPreviewToken(ctx, event.id)).toBe(token);
    expect(previewAllowed({ previewToken: token }, token)).toBe(true);
    expect(previewAllowed({ previewToken: token }, `${token.slice(0, -1)}${token.endsWith("x") ? "y" : "x"}`)).toBe(false);
    expect(previewAllowed({ previewToken: token }, undefined)).toBe(false);
    await revokePreviewToken(ctx, event.id);
    expect((await db.event.findUniqueOrThrow({ where: { id: event.id } })).previewToken).toBeNull();
  });

  it("prévient l'organisation une seule fois à la publication, et pas quand elle publie elle-même tout de suite", async () => {
    const { org, event, ctx } = await setup();
    await savePublication(ctx, event.id, { publishLocal: utcToZonedLocal(days(1), TZ), mode: "HIDDEN", teaserText: null });
    await db.event.update({ where: { id: event.id }, data: { publishAt: new Date(Date.now() - 1000) } });
    await notifyPublishedEvents();
    await notifyPublishedEvents();
    expect(await db.notification.count({ where: { organizationId: org.id, type: "EVENT_PUBLISHED" } })).toBe(2);
    expect(await db.emailMessage.count({ where: { organizationId: org.id, template: "notification.event_published" } })).toBe(2);
    const other = await setup();
    await savePublication(other.ctx, other.event.id, { publishLocal: utcToZonedLocal(new Date(Date.now() - 60_000), TZ), mode: "HIDDEN", teaserText: null });
    await notifyPublishedEvents();
    expect(await db.notification.count({ where: { organizationId: other.org.id, type: "EVENT_PUBLISHED" } })).toBe(0);
  });
});
