import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createDistributor, setAllocation } from "@/server/distributors";
import { createEvent } from "@/server/events";
import { applySeatingTemplate, setSeatingMode } from "@/server/seating";
import { importExternalTickets } from "@/server/externalImport";

// import des billets d'un réseau en 1 clic (docs/COMPATIBILITE_RESEAUX.md)
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Spectacle de printemps",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-17T23:00",
  timezone: "Europe/Paris",
  locationType: "PHYSICAL" as const,
  locationName: "Cabaret",
  city: "Paris",
  country: "FR",
};
async function setup(o: { pro?: boolean } = {}) {
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
  if (o.pro !== false)
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
  const tm =
    o.pro === false
      ? null
      : await createDistributor(ctx, { kind: "TICKETMASTER" });
  return { ctx, eventId: event.id, tm, id };
}
const csv = (text: string, name = "ticketmaster.csv") => ({
  name,
  bytes: new TextEncoder().encode(text),
});
const tickets = (eventId: string) =>
  db.externalTicket.findMany({
    where: { eventId },
    orderBy: [{ code: "asc" }, { reservation: "asc" }, { rank: "asc" }],
  });

describe("import des billets d'un réseau", () => {
  it("import, réimport identique sans changement, nom modifié mis à jour ; fichier complet : disparu annulé, déjà entré gardé", async () => {
    const { ctx, eventId, tm } = await setup();
    const file =
      "Code-barres;Nom;Tarif;Prix TTC\n4006381333931;Léa Martin;Plein tarif;25,00 €\n4006381333948;Tom Dubois;Plein tarif;25,00\n4006381333955;Inès Benali;Plein tarif;25\n";
    expect(
      await importExternalTickets(ctx, eventId, tm!.id, csv(file)),
    ).toMatchObject({ created: 3, updated: 0, ignored: [] });
    const first = await tickets(eventId);
    expect(
      first.map((t) => [t.code, t.holderName, t.priceMinor, t.status]),
    ).toEqual([
      ["4006381333931", "Léa Martin", 2500, "VALID"],
      ["4006381333948", "Tom Dubois", 2500, "VALID"],
      ["4006381333955", "Inès Benali", 2500, "VALID"],
    ]);
    expect(first.every((t) => t.ticketTypeId)).toBe(true);
    expect(
      await importExternalTickets(ctx, eventId, tm!.id, csv(file)),
    ).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
    expect(
      await importExternalTickets(
        ctx,
        eventId,
        tm!.id,
        csv(file.replace("Tom Dubois", "Thomas Dubois")),
      ),
    ).toMatchObject({ updated: 1, unchanged: 2 });
    await db.externalTicket.update({
      where: { id: first[2]!.id },
      data: { checkedInAt: new Date() },
    });
    const shorter = "Code-barres;Nom\n4006381333931;Léa Martin\n";
    expect(
      await importExternalTickets(ctx, eventId, tm!.id, csv(shorter), {
        fullFile: true,
      }),
    ).toMatchObject({ cancelled: 1, keptEntered: 1 });
    expect((await tickets(eventId)).map((t) => t.status)).toEqual([
      "VALID",
      "CANCELLED",
      "VALID",
    ]);
  });

  it("réservations BilletReduc sans code-barres : un billet par place ; doublon et ligne vide ignorés avec leur ligne", async () => {
    const { ctx, eventId, id } = await setup();
    const br = await createDistributor(ctx, { kind: "BILLETREDUC" });
    const file =
      "N° réservation;Nom;Nb places\nBR-1;Durand;2\nBR-2;Lefèvre;1\nBR-1;Durand;2\n;;\n;Sans réservation;1\n";
    const report = await importExternalTickets(
      ctx,
      eventId,
      br.id,
      csv(file, `billetreduc-${id}.csv`),
    );
    expect(report).toMatchObject({
      created: 3,
      ignored: [
        { line: 4, reason: "DUPLICATE_IN_FILE" },
        { line: 6, reason: "LINE_NO_CODE" },
      ],
    });
    expect(
      (await tickets(eventId)).map((t) => [
        t.reservation,
        t.rank,
        t.holderName,
      ]),
    ).toEqual([
      ["BR-1", 1, "Durand"],
      ["BR-1", 2, "Durand"],
      ["BR-2", 1, "Lefèvre"],
    ]);
  });

  it("fichier ambigu : colonnes demandées une fois, puis retrouvées seules pour un fichier de même forme", async () => {
    const { ctx, eventId, tm } = await setup();
    const file = "Ref;Client\nX-9001;Léa\n";
    const first = await importExternalTickets(ctx, eventId, tm!.id, csv(file));
    expect(first.needsMapping).toMatchObject({ headers: ["Ref", "Client"] });
    expect(
      await importExternalTickets(ctx, eventId, tm!.id, csv(file), {
        mapping: { code: 0, fullName: 1 },
        header: true,
      }),
    ).toMatchObject({ created: 1 });
    const again = await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv("Ref;Client\nX-9002;Tom\n"),
    );
    expect([again.created, again.needsMapping]).toEqual([1, undefined]);
  });

  it("code déjà utilisé par un autre réseau : ignoré ; dépassement de contingent : signalé sans bloquer ; Pro exigé", async () => {
    const { ctx, eventId, tm } = await setup();
    const fnac = await createDistributor(ctx, { kind: "FRANCE_BILLET" });
    const ticketTypeId = (
      await db.ticketType.findFirstOrThrow({ where: { eventId } })
    ).id;
    await setAllocation(ctx, eventId, {
      distributorId: tm!.id,
      ticketTypeId,
      quantity: 1,
    });
    await importExternalTickets(
      ctx,
      eventId,
      fnac.id,
      csv("Code-barres\n9990001112223\n"),
    );
    const report = await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv("Code-barres\n9990001112223\n4006381333931\n4006381333948\n"),
    );
    expect(report).toMatchObject({
      created: 2,
      ignored: [{ line: 2, reason: "CODE_USED_BY_OTHER_NETWORK" }],
      overAllocation: [
        { ticketType: "Plein tarif", allocated: 1, imported: 2 },
      ],
    });
    const free = await setup({ pro: false });
    await expect(
      importExternalTickets(free.ctx, free.eventId, "x", csv("Code\n1\n")),
    ).rejects.toMatchObject({ code: "PRO_REQUIRED" });
  });

  it("places numérotées : place reliée et retirée de la vente en ligne ; déjà vendue par Evoly : double vente signalée ; inconnue : comptée", async () => {
    const { ctx, eventId, tm } = await setup();
    await applySeatingTemplate(ctx, eventId, "hall", {
      rows: 1,
      seatsFirst: 4,
      seatsLast: 4,
      centerAisle: false,
      categories: 1,
    });
    await setSeatingMode(ctx, eventId, true);
    const seats = await db.seat.findMany({
      where: { row: { seatingMap: { eventId } } },
      orderBy: { sortOrder: "asc" },
      include: { row: { select: { name: true } } },
    });
    const [a1, a2] = seats;
    await db.seat.update({ where: { id: a2!.id }, data: { status: "SOLD" } }); // vendue en ligne sur Evoly
    const file = `Code-barres;Rang;Place\nTM-1;${a1!.row.name};${a1!.label}\nTM-2;${a2!.row.name};${a2!.label}\nTM-3;Z;99\n`;
    const report = await importExternalTickets(ctx, eventId, tm!.id, csv(file));
    expect(report).toMatchObject({
      created: 3,
      seatsNotFound: 1,
      seatsSoldOnEvoly: [{ line: 3, seat: `${a2!.row.name} ${a2!.label}` }],
    });
    const linked = await db.externalTicket.findFirstOrThrow({
      where: { eventId, code: "TM-1" },
    });
    expect(linked.seatId).toBe(a1!.id);
    expect(
      await db.seat.findUniqueOrThrow({
        where: { id: a1!.id },
        select: { status: true, distributorId: true },
      }),
    ).toEqual({
      status: "BLOCKED",
      distributorId: tm!.id,
    });
    expect(
      (
        await db.externalTicket.findFirstOrThrow({
          where: { eventId, code: "TM-2" },
        })
      ).seatId,
    ).toBeNull();
  });
});
