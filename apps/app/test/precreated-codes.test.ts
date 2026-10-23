import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createDistributor, createPrecreatedCodes, precreatedCodesCsv, setAllocation } from "@/server/distributors";
import { createEvent, publishEvent } from "@/server/events";
import { checkIn, resolveScannerLink, scannerToken } from "@/server/scanner";

// codes créés à l'avance pour un réseau (BilletReduc…) : imprimés par le réseau, scannés comme ses billets
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
async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.fr`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Cabaret ${id}`, slug: `cab-${id}`, subdomain: `cab-${id}`, country: "FR", currency: "EUR", timezone: "Europe/Paris", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "=Plein tarif", price: "0", quantity: 100 });
  await publishEvent(ctx, event.id);
  const ticketTypeId = (await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })).id;
  const br = await createDistributor(ctx, { kind: "BILLETREDUC" });
  return { ctx, eventId: event.id, ticketTypeId, br, owner, id };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("codes créés à l'avance pour un réseau", () => {
  it("pris sur le contingent, jamais au-delà ; codes lisibles, sans caractère ambigu, tous différents ; nombre invalide refusé", async () => {
    const { ctx, eventId, ticketTypeId, br } = await setup();
    await expect(createPrecreatedCodes(ctx, eventId, { distributorId: br.id, ticketTypeId, count: 2 })).rejects.toEqual(
      refused("PRECREATED_EXCEEDS_ALLOCATION"),
    ); // sans contingent
    await setAllocation(ctx, eventId, { distributorId: br.id, ticketTypeId, quantity: 5 });
    expect(await createPrecreatedCodes(ctx, eventId, { distributorId: br.id, ticketTypeId, count: 3 })).toEqual({ created: 3 });
    await expect(createPrecreatedCodes(ctx, eventId, { distributorId: br.id, ticketTypeId, count: 3 })).rejects.toEqual(
      refused("PRECREATED_EXCEEDS_ALLOCATION"),
    );
    await expect(createPrecreatedCodes(ctx, eventId, { distributorId: br.id, ticketTypeId, count: 0 })).rejects.toEqual(refused("PRECREATED_COUNT_INVALID"));
    const codes = (await db.externalTicket.findMany({ where: { eventId, precreated: true } })).map((c) => c.code!);
    expect(codes).toHaveLength(3);
    expect(new Set(codes).size).toBe(3);
    for (const c of codes) expect(c).toMatch(/^EV[2-9A-HJKMNP-TV-Z]{10}$/);
    await expect(setAllocation(ctx, eventId, { distributorId: br.id, ticketTypeId, quantity: 2 })).rejects.toEqual(refused("ALLOCATION_BELOW_IMPORTED"));
  });

  it("un code créé à l'avance passe au scanner ; export CSV pour l'impression, nom de tarif piégé neutralisé", async () => {
    const { ctx, eventId, ticketTypeId, br, owner, id } = await setup();
    await setAllocation(ctx, eventId, { distributorId: br.id, ticketTypeId, quantity: 2 });
    await createPrecreatedCodes(ctx, eventId, { distributorId: br.id, ticketTypeId, count: 2 });
    const [code] = (await db.externalTicket.findMany({ where: { eventId, precreated: true }, orderBy: { createdAt: "asc" } })).map((c) => c.code!);
    const link = await db.scannerLink.create({
      data: { id: `c${id}scan0000000000000`, eventId, tokenHash: "x", label: "Porte", expiresAt: new Date(Date.now() + 86_400_000), createdById: owner.id },
    });
    await db.scannerLink.update({ where: { id: link.id }, data: { tokenHash: createHash("sha256").update(scannerToken(link.id)).digest("hex") } });
    const resolved = (await resolveScannerLink(scannerToken(link.id)))!.link;
    expect((await checkIn(resolved, { code: code!, method: "QR" })).result).toBe("VALID");
    const { name, csv } = await precreatedCodesCsv(ctx, eventId, br.id);
    const lines = csv.trim().split("\r\n");
    expect([name, lines[0], lines.length]).toEqual(["BilletReduc", "Code;Tarif", 3]);
    expect(lines[1]).toMatch(/^EV[2-9A-HJKMNP-TV-Z]{10};'=Plein tarif$/);
  });
});
