import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { checkIn, createScannerLink, resolveScannerLink, revertCheckIn, scannerToken } from "@/server/scanner";

// scanner : vérification seule, annulation d'une entrée (motif, historique), recherche dans la liste limitée à l'événement
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(count: number, opts: { checkOnly?: boolean } = {}) {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille Dupont", email: `scan.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Test ${id}`, slug: `test-${id}`, subdomain: `test-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `e-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Concert ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Fosse", priceMinor: 0, currency: "EUR", quantity: 500 } },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: count }], locale: "fr" });
  await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false });
  const tickets = await db.ticket.findMany({ where: { eventId: event.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const ctx = { organization: { id: org.id }, user: { id: user.id } } as unknown as OrgContext;
  const created = await createScannerLink(ctx, event.id, {
    label: "Entrée principale",
    duration: "24H",
    allowManualSearch: true,
    checkOnly: opts.checkOnly ?? false,
  });
  const resolved = await resolveScannerLink(scannerToken(created.id));
  return { ctx, org, event, tickets, link: resolved!.link };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("scanner : vérification seule", () => {
  it("lien « contrôle seulement » : diagnostic donné, ni entrée ni journal", async () => {
    const { link, tickets } = await setup(1, { checkOnly: true });
    expect((await checkIn(link, { code: tickets[0]!.code, method: "QR" })).result).toBe("VALID");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: tickets[0]!.id } })).status).toBe("VALID");
    expect(await db.checkIn.count({ where: { ticketId: tickets[0]!.id } })).toBe(0);
  });

  it("scan demandé en vérification sur un lien normal : rien n'est enregistré ; le vrai scan ensuite passe", async () => {
    const { link, tickets } = await setup(1);
    expect((await checkIn(link, { code: tickets[0]!.code, method: "QR", verify: true })).result).toBe("VALID");
    expect(await db.checkIn.count({ where: { ticketId: tickets[0]!.id } })).toBe(0);
    expect((await checkIn(link, { code: tickets[0]!.code, method: "QR" })).result).toBe("VALID");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: tickets[0]!.id } })).status).toBe("CHECKED_IN");
  });
});

describe("scanner : annulation d'une entrée", () => {
  it("motif exigé, billet de nouveau valable, journal et historique ; deuxième annulation refusée ; autre organisateur : introuvable", async () => {
    const { ctx, org, link, tickets } = await setup(1);
    const t = tickets[0]!;
    await checkIn(link, { code: t.code, method: "QR" });
    await expect(revertCheckIn(ctx, t.id, " ok ")).rejects.toEqual(refused("CHECKIN_REVERT_REASON"));
    await revertCheckIn(ctx, t.id, "  Scanné par erreur au vestiaire  ");
    expect(await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ status: "VALID", checkedInAt: null });
    expect(await db.checkIn.findFirstOrThrow({ where: { ticketId: t.id, result: "REVERTED" } })).toMatchObject({
      note: "Scanné par erreur au vestiaire",
      userId: ctx.user.id,
    });
    expect(await db.auditLog.count({ where: { organizationId: org.id, action: "checkin.reverted", targetId: t.id } })).toBe(1);
    await expect(revertCheckIn(ctx, t.id, "Encore une fois")).rejects.toEqual(refused("CHECKIN_NOT_REVERTIBLE"));
    const other = await setup(1);
    await expect(revertCheckIn(other.ctx, t.id, "Pas mon billet")).rejects.toEqual(refused("NOT_FOUND"));
    // annulée, l'entrée peut être scannée de nouveau
    expect((await checkIn(link, { code: t.code, method: "QR" })).result).toBe("VALID");
  });
});

describe("scanner : recherche dans la liste", () => {
  it("un billet de l'événement passe ; celui d'un autre événement n'est pas trouvé par ce lien", async () => {
    const a = await setup(1);
    const b = await setup(1);
    expect((await checkIn(a.link, { ticketId: a.tickets[0]!.id, method: "LIST" })).result).toBe("VALID");
    expect((await checkIn(a.link, { ticketId: b.tickets[0]!.id, method: "LIST" })).result).not.toBe("VALID");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: b.tickets[0]!.id } })).status).toBe("VALID");
  });
});
