import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import {
  createEvent,
  publishEvent,
  updateEventSettings,
} from "@/server/events";

// réglages d'un événement (RG-EVT-01, 05 et 10) : jauge, dates des ventes, verrouillage, changement important, modification simultanée
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
const settings = {
  ...essentials,
  maxTicketsPerOrder: 10,
  visibility: "PUBLIC" as const,
  refundPolicy: "ON_REQUEST" as const,
  resaleEnabled: false,
  resaleCutoffMinutes: 120,
  showResaleSection: false,
};
async function organizer() {
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
  return {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
}
async function setup() {
  const ctx = await organizer();
  const event = await createEvent(ctx, essentials, {
    name: "Entrée",
    price: "0",
    quantity: 100,
  });
  const ticketTypeId = (
    await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })
  ).id;
  return { ctx, event, ticketTypeId };
}
const refused = (code: string) => expect.objectContaining({ code });
const audits = (organizationId: string, action: string) =>
  db.auditLog.count({ where: { organizationId, action } });

describe("réglages d'un événement", () => {
  it("jauge : refusée sous les billets vendus et retenus, acceptée quand elle leur est égale", async () => {
    const { ctx, event, ticketTypeId } = await setup();
    await publishEvent(ctx, event.id);
    const sold = await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 3 }],
      locale: "fr",
    });
    await submitBuyer(sold.token, {
      firstName: "Léa",
      lastName: "Martin",
      email: `lea.${rid()}@exemple.be`,
      marketingOptIn: false,
    });
    await reserveOrder({
      eventId: event.id,
      lines: [{ ticketTypeId, quantity: 2 }],
      locale: "fr",
    }); // panier en cours : 2 billets retenus
    await expect(
      updateEventSettings(ctx, event.id, { ...settings, capacity: 4 }),
    ).rejects.toEqual(refused("CAPACITY_BELOW_SOLD"));
    await updateEventSettings(ctx, event.id, { ...settings, capacity: 5 });
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } })).capacity,
    ).toBe(5);
  });

  it("dates : fin des ventes avant leur ouverture refusée ; remboursement jusqu'à une date sans date refusé", async () => {
    const { ctx, event } = await setup();
    await expect(
      updateEventSettings(ctx, event.id, {
        ...settings,
        salesStartLocal: "2027-03-10T10:00",
        salesEndLocal: "2027-03-01T10:00",
      }),
    ).rejects.toEqual(refused("SALES_END_BEFORE_START"));
    await expect(
      updateEventSettings(ctx, event.id, {
        ...settings,
        refundPolicy: "UNTIL_DEADLINE",
        refundDeadlineLocal: null,
      }),
    ).rejects.toEqual(refused("REFUND_DEADLINE_REQUIRED"));
    await updateEventSettings(ctx, event.id, {
      ...settings,
      refundPolicy: "UNTIL_DEADLINE",
      refundDeadlineLocal: "2027-04-10T23:59",
    });
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .refundDeadlineAt,
    ).not.toBeNull();
  });

  it("terminé, annulé ou archivé : réglages verrouillés ; événement d'un autre organisateur : introuvable", async () => {
    const { ctx, event } = await setup();
    for (const status of ["ENDED", "CANCELLED", "ARCHIVED"] as const) {
      await db.event.update({ where: { id: event.id }, data: { status } });
      await expect(
        updateEventSettings(ctx, event.id, settings),
      ).rejects.toEqual(refused("EVENT_LOCKED"));
    }
    const other = await organizer();
    await expect(
      updateEventSettings(other, event.id, settings),
    ).rejects.toEqual(refused("NOT_FOUND"));
  });

  it("changement important (date ou lieu) après publication : noté et inscrit à l'historique ; brouillon ou titre seul : rien", async () => {
    const { ctx, event } = await setup();
    await updateEventSettings(ctx, event.id, {
      ...settings,
      startsAtLocal: "2027-04-18T20:00",
      endsAtLocal: "2027-04-19T02:00",
    }); // brouillon
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .lastMajorChangeAt,
    ).toBeNull();
    await publishEvent(ctx, event.id);
    await updateEventSettings(ctx, event.id, {
      ...settings,
      startsAtLocal: "2027-04-18T20:00",
      endsAtLocal: "2027-04-19T02:00",
      title: "Gala 2027",
    }); // titre seul
    expect(await audits(ctx.organization.id, "event.major_change")).toBe(0);
    await updateEventSettings(ctx, event.id, {
      ...settings,
      startsAtLocal: "2027-04-24T20:00",
      endsAtLocal: "2027-04-25T02:00",
    }); // nouvelle date
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } }))
        .lastMajorChangeAt,
    ).not.toBeNull();
    expect(await audits(ctx.organization.id, "event.major_change")).toBe(1);
    await updateEventSettings(ctx, event.id, {
      ...settings,
      startsAtLocal: "2027-04-24T20:00",
      endsAtLocal: "2027-04-25T02:00",
      city: "Tournai",
    }); // nouveau lieu
    expect(await audits(ctx.organization.id, "event.major_change")).toBe(2);
  });

  it("modification simultanée : enregistrée quand même, et signalée", async () => {
    const { ctx, event } = await setup();
    const stale = new Date(Date.now() - 60_000).toISOString();
    await updateEventSettings(ctx, event.id, {
      ...settings,
      title: "Première version",
    });
    const late = await updateEventSettings(ctx, event.id, {
      ...settings,
      title: "Seconde version",
      version: stale,
    });
    expect(late.concurrent).toBe(true);
    expect(late.title).toBe("Seconde version");
    const fresh = await updateEventSettings(ctx, event.id, {
      ...settings,
      title: "Troisième version",
      version: late.updatedAt.toISOString(),
    });
    expect(fresh.concurrent).toBe(false);
  });
});
