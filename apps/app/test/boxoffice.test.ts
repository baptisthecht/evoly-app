import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cashReport, sellCash } from "@/server/boxOffice";
import { findOrgContext } from "@/server/context";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 5 } },
    },
    include: { ticketTypes: true },
  });
  const lien = (data: { canSell?: boolean; checkOnly?: boolean; label?: string }) =>
    db.scannerLink.create({
      data: {
        eventId: event.id,
        tokenHash: `h-${rid()}`,
        label: data.label ?? "Entrée principale",
        expiresAt: new Date(Date.now() + 30 * DAY),
        createdById: owner.id,
        canSell: !!data.canSell,
        checkOnly: !!data.checkOnly,
      },
    });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { event, type: event.ticketTypes[0]!, lien, ctx };
}

describe("vente sur place en espèces (section 9.27)", () => {
  it("vente enregistrée sans commission, billets entrés, stock partagé, e-mail facultatif, droits du lien, rapport de caisse", async () => {
    const s = await setup();
    const caisse = await s.lien({ canSell: true, label: "Caisse 1" });
    const r = await sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 2 }], deviceId: "tel-1" });
    expect(r.tickets).toBe(2);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { tickets: true } });
    expect(order).toMatchObject({
      status: "PAID",
      source: "BOX_OFFICE",
      boxOfficeMode: "CASH",
      applicationFeeMinor: 0,
      soldByLinkId: caisse.id,
      totalMinor: 2000,
    });
    expect(order.tickets.every((t) => t.status === "CHECKED_IN")).toBe(true);
    expect(await db.checkIn.count({ where: { scannerLinkId: caisse.id, result: "VALID" } })).toBe(2);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: s.type.id } })).quantitySold).toBe(2);
    // avec un e-mail : le client reçoit ses billets
    const email = `client.${rid()}@exemple.be`;
    await sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }], email });
    expect(await db.emailMessage.count({ where: { toEmail: email } })).toBeGreaterThanOrEqual(1);
    // droits du lien : pas de vente sans autorisation, ni avec un lien de vérification seule
    await expect(sellCash(await s.lien({}), { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] })).rejects.toMatchObject({ code: "BOX_OFFICE_FORBIDDEN" });
    await expect(
      sellCash({ ...(await s.lien({ canSell: true })), checkOnly: true }, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "BOX_OFFICE_FORBIDDEN" });
    // même stock que la vente en ligne : 2 places restent, pas une de plus
    await sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 2 }] });
    await expect(sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] })).rejects.toThrow();
    expect(await cashReport(s.ctx, s.event.id)).toEqual([{ label: "Caisse 1", mode: "CASH", sales: 3, amountMinor: 5000 }]);
  });
});
