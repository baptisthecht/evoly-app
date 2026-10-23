import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createDistributor } from "@/server/distributors";
import { createEvent, publishEvent } from "@/server/events";
import {
  attendanceStats,
  checkIn,
  resolveScannerLink,
  revertCheckIn,
  scannerManifest,
  scannerToken,
} from "@/server/scanner";

// scanner et billets vendus par les réseaux (docs/COMPATIBILITE_RESEAUX.md) : mêmes garanties qu'un billet Evoly
const rid = () => Math.random().toString(36).slice(2, 10);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
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
async function setup(o: { checkOnly?: boolean } = {}) {
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
  await publishEvent(ctx, event.id);
  const ticketTypeId = (
    await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })
  ).id;
  const tm = await createDistributor(ctx, { kind: "TICKETMASTER" });
  const link = await db.scannerLink.create({
    data: {
      id: `c${id}scan0000000000000`,
      eventId: event.id,
      tokenHash: "x",
      label: "Porte A",
      expiresAt: new Date(Date.now() + 86_400_000),
      createdById: owner.id,
      checkOnly: !!o.checkOnly,
    },
  });
  await db.scannerLink.update({
    where: { id: link.id },
    data: { tokenHash: sha256(scannerToken(link.id)) },
  });
  const resolved = (await resolveScannerLink(scannerToken(link.id)))!.link;
  const ext = (code: string | null, extra: Record<string, unknown> = {}) =>
    db.externalTicket.create({
      data: {
        eventId: event.id,
        distributorId: tm.id,
        ticketTypeId,
        code,
        holderName: "Léa Martin",
        seatLabel: "C 12",
        ...extra,
      },
    });
  return { ctx, eventId: event.id, link: resolved, ext };
}

describe("scanner : billets vendus par les réseaux", () => {
  it("liste des appareils : billets importés avec l'empreinte de leur code et le réseau d'origine", async () => {
    const { link, ext } = await setup();
    const t = await ext("4006381333931");
    const m = await scannerManifest(link);
    const entry = m.tickets.find((x) => x.id === `x:${t.id}`)!;
    expect(entry).toMatchObject({
      codeHash: sha256(`${m.salt}:4006381333931`),
      groupHash: sha256(`${m.salt}:4006381333931`),
      network: "Ticketmaster",
      holder: "Léa Martin",
      status: "VALID",
    });
    expect(entry.typeName).toBe("Plein tarif · C 12");
  });

  it("code-barres scanné : entrée ; second passage refusé avec l'heure et la porte ; code tapé avec une autre casse retrouvé", async () => {
    const { link, ext } = await setup();
    await ext("4006381333931");
    const first = await checkIn(link, { code: "4006381333931", method: "QR" });
    expect(first).toMatchObject({
      result: "VALID",
      ticket: {
        holder: "Léa Martin",
        typeName: "Plein tarif · C 12 · Ticketmaster",
        status: "CHECKED_IN",
      },
    });
    expect(
      await checkIn(link, { code: "4006381333931", method: "QR" }),
    ).toMatchObject({ result: "ALREADY_USED", firstScan: { gate: "Porte A" } });
    await ext("tm-abc123");
    expect(
      (await checkIn(link, { shortCode: "TM-ABC123", method: "MANUAL_CODE" }))
        .result,
    ).toBe("VALID");
  });

  it("réservation de 2 places sur un même code : deux passages admis, le troisième refusé", async () => {
    const { link, ext } = await setup();
    await ext("BR-77812", { reservation: "BR-77812", rank: 1 });
    await ext("BR-77812#2", { reservation: "BR-77812", rank: 2 });
    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(
        (await checkIn(link, { code: "BR-77812", method: "QR" })).result,
      );
    expect(results).toEqual(["VALID", "VALID", "ALREADY_USED"]);
  });

  it("billet annulé par le réseau : refusé ; code inconnu : refusé ; vérification seule : rien n'est enregistré", async () => {
    const { link, ext } = await setup();
    await ext("CANCEL-1", { status: "CANCELLED" });
    expect(
      (await checkIn(link, { code: "CANCEL-1", method: "QR" })).result,
    ).toBe("VOID");
    expect(
      (await checkIn(link, { code: "INCONNU-99", method: "QR" })).result,
    ).toBe("INVALID");
    const only = await setup({ checkOnly: true });
    const t = await only.ext("VERIF-1");
    expect(
      (await checkIn(only.link, { code: "VERIF-1", method: "QR" })).result,
    ).toBe("VALID");
    expect(
      (await db.externalTicket.findUniqueOrThrow({ where: { id: t.id } }))
        .checkedInAt,
    ).toBeNull();
  });

  it("hors connexion : le scan le plus ancien l'emporte ; entrée annulée par l'organisateur ; fréquentation comptée", async () => {
    const { ctx, eventId, link, ext } = await setup();
    const t = await ext("OFF-1");
    await checkIn(link, { code: "OFF-1", method: "QR" });
    const earlier = new Date(Date.now() - 60_000).toISOString();
    expect(
      (
        await checkIn(link, {
          ticketId: `x:${t.id}`,
          method: "QR",
          offline: true,
          scannedAt: earlier,
        })
      ).result,
    ).toBe("VALID");
    expect(
      (
        await db.externalTicket.findUniqueOrThrow({ where: { id: t.id } })
      ).checkedInAt?.toISOString(),
    ).toBe(earlier);
    const stats = await attendanceStats(eventId);
    expect(JSON.stringify(stats)).toContain("Plein tarif");
    await revertCheckIn(ctx, `x:${t.id}`, "Erreur à la porte");
    expect(
      (await db.externalTicket.findUniqueOrThrow({ where: { id: t.id } }))
        .checkedInAt,
    ).toBeNull();
    expect(
      await db.checkIn.count({
        where: { externalTicketId: t.id, result: "REVERTED" },
      }),
    ).toBe(1);
  });
});
