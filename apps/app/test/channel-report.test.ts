import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import {
  channelReportCsv,
  createDistributor,
  eventChannelReport,
} from "@/server/distributors";
import { createEvent } from "@/server/events";

// bilan par canal (docs/COMPATIBILITE_RESEAUX.md) : Evoly en ligne, sur place, offerts, et chaque réseau
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Spectacle",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-17T23:00",
  timezone: "Europe/Paris",
  locationType: "PHYSICAL" as const,
  locationName: "Cabaret",
  city: "Paris",
  country: "FR",
};

describe("bilan par canal", () => {
  it("billets valables et entrées par canal ; recette déclarée par les réseaux ; billets annulés exclus ; export CSV protégé", async () => {
    const id = rid();
    const owner = await db.user.create({
      data: {
        name: "Camille Dupont",
        email: `own.${id}@exemple.fr`,
        emailVerified: true,
      },
    });
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
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000),
      },
    });
    const ctx = {
      ...(await findOrgContext(owner.id, org.slug))!,
      user: { id: owner.id, name: owner.name ?? "", email: owner.email },
    };
    const event = await createEvent(ctx, essentials, {
      name: "Plein tarif",
      price: "0",
      quantity: 100,
    });
    const tm = await createDistributor(ctx, { kind: "TICKETMASTER" });
    const br = await createDistributor(ctx, {
      kind: "OTHER",
      name: "=Réseau piégé",
    });
    await db.externalTicket.createMany({
      data: [
        {
          eventId: event.id,
          distributorId: tm.id,
          code: `A-${id}`,
          priceMinor: 2500,
          checkedInAt: new Date(),
        },
        {
          eventId: event.id,
          distributorId: tm.id,
          code: `B-${id}`,
          priceMinor: 2500,
        },
        {
          eventId: event.id,
          distributorId: tm.id,
          code: `C-${id}`,
          priceMinor: 2500,
          status: "CANCELLED",
        },
        { eventId: event.id, distributorId: br.id, code: `D-${id}` },
      ],
    });
    const report = await eventChannelReport(ctx, event.id);
    expect(report.rows.filter((r) => r.channel === "NETWORK")).toEqual([
      {
        channel: "NETWORK",
        name: "Ticketmaster",
        tickets: 2,
        entered: 1,
        declaredRevenueMinor: 5000,
      },
      {
        channel: "NETWORK",
        name: "=Réseau piégé",
        tickets: 1,
        entered: 0,
        declaredRevenueMinor: null,
      },
    ]);
    expect(report.rows.slice(0, 3).map((r) => r.channel)).toEqual([
      "ONLINE",
      "BOX_OFFICE",
      "COMPLIMENTARY",
    ]);
    expect(report.total).toEqual({ tickets: 3, entered: 1 });
    const csv = channelReportCsv(report, {
      ONLINE: "En ligne",
      BOX_OFFICE: "Sur place",
      COMPLIMENTARY: "Offerts",
      header: ["Canal", "Billets", "Entrées", "Recette déclarée"],
      total: "Total",
    })
      .trim()
      .split("\r\n");
    expect(csv[0]).toBe("Canal;Billets;Entrées;Recette déclarée");
    expect(csv).toContain("Ticketmaster;2;1;50,00");
    expect(csv).toContain("'=Réseau piégé;1;0;");
    expect(csv.at(-1)).toBe("Total;3;1;");
  });
});
