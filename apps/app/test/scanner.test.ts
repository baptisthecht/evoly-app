import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { attendanceStats, checkIn, createScannerLink, resolveScannerLink, revokeScannerLink, scannerManifest, scannerToken, syncScans } from "@/server/scanner";

const rid = () => Math.random().toString(36).slice(2, 10);

/** Organisation, événement publié, commande gratuite de `count` billets payée, et un lien bénévole. */
async function setup(count: number, opts: { allowManualSearch?: boolean } = {}) {
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
  const tickets = await db.ticket.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
  const ctx = { organization: { id: org.id }, user: { id: user.id } } as unknown as OrgContext;
  const created = await createScannerLink(ctx, event.id, { label: "Entrée principale", duration: "24H", allowManualSearch: opts.allowManualSearch ?? true });
  const resolved = await resolveScannerLink(scannerToken(created.id));
  return { ctx, org, event, tickets, link: resolved!.link, created };
}

describe("scanner (RG-SCN-01 à 09)", () => {
  it("20 scans simultanés du même billet : un seul passage validé, tous journalisés", async () => {
    const { link, tickets } = await setup(1);
    const results = await Promise.all(Array.from({ length: 20 }, () => checkIn(link, { code: tickets[0]!.code, method: "QR" })));
    expect(results.filter((r) => r.result === "VALID")).toHaveLength(1);
    expect(results.filter((r) => r.result === "ALREADY_USED")).toHaveLength(19);
    expect(results.find((r) => r.result === "ALREADY_USED")?.firstScan?.gate).toBe("Entrée principale");
    expect(await db.checkIn.count({ where: { ticketId: tickets[0]!.id } })).toBe(20);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: tickets[0]!.id } })).status).toBe("CHECKED_IN");
  });

  it("code court, autre événement, billet inconnu, billet désactivé", async () => {
    const a = await setup(2);
    const b = await setup(1);
    const short = a.tickets[0]!.shortCode;
    expect((await checkIn(a.link, { shortCode: `${short.slice(0, 4).toLowerCase()}-${short.slice(4)}`, method: "MANUAL_CODE" })).result).toBe("VALID");
    const other = await checkIn(a.link, { code: b.tickets[0]!.code, method: "QR" });
    expect(other).toMatchObject({ result: "WRONG_EVENT", otherEvent: b.event.title, ticket: null });
    expect((await checkIn(a.link, { code: "x".repeat(32), method: "QR" })).result).toBe("INVALID");
    await db.ticket.update({ where: { id: a.tickets[1]!.id }, data: { status: "REFUNDED" } });
    expect((await checkIn(a.link, { code: a.tickets[1]!.code, method: "QR" })).result).toBe("VOID");
  });

  it("hors ligne : le premier scan horodaté l'emporte", async () => {
    const { link, tickets } = await setup(1);
    const online = await checkIn(link, { code: tickets[0]!.code, method: "QR" });
    expect(online.result).toBe("VALID");
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const [earlier] = await syncScans(link, [{ clientId: "a", code: tickets[0]!.code, method: "QR", scannedAt: tenMinutesAgo }]);
    expect(earlier!.result).toBe("VALID");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: tickets[0]!.id } })).checkedInAt?.toISOString()).toBe(tenMinutesAgo);
    const [later] = await syncScans(link, [
      { clientId: "b", code: tickets[0]!.code, method: "QR", scannedAt: new Date(Date.now() - 5 * 60_000).toISOString() },
    ]);
    expect(later!.result).toBe("ALREADY_USED");
  });

  it("lien révoqué ou expiré : plus aucun accès (RG-SCN-05)", async () => {
    const { ctx, event, created } = await setup(1);
    await revokeScannerLink(ctx, event.id, created.id);
    expect((await resolveScannerLink(scannerToken(created.id)))?.state).toBe("REVOKED");
    await db.scannerLink.update({ where: { id: created.id }, data: { revokedAt: null, expiresAt: new Date(Date.now() - 1000) } });
    expect((await resolveScannerLink(scannerToken(created.id)))?.state).toBe("EXPIRED");
    expect(await resolveScannerLink("pas-un-jeton")).toBeNull();
    expect(await resolveScannerLink("A".repeat(43))).toBeNull();
  });

  it("liste locale : codes hachés avec le sel du lien, aucune donnée financière (RG-SCN-03, RG-SCN-06)", async () => {
    const { link, tickets } = await setup(2);
    const m = await scannerManifest(link);
    expect(m.tickets).toHaveLength(2);
    expect(m.tickets[0]!.codeHash).toBe(createHash("sha256").update(`${link.id}:${tickets[0]!.code}`).digest("hex"));
    const serialized = JSON.stringify(m);
    for (const forbidden of ["priceMinor", "faceValueMinor", "totalMinor", tickets[0]!.code]) expect(serialized).not.toContain(forbidden);
  });

  it("recherche manuelle interdite sur ce lien, et statistiques de présence", async () => {
    const { link, tickets, event } = await setup(3, { allowManualSearch: false });
    await expect(checkIn(link, { ticketId: tickets[0]!.id, method: "LIST" })).rejects.toThrow("MANUAL_SEARCH_DISABLED");
    await checkIn(link, { code: tickets[0]!.code, method: "QR" });
    await checkIn(link, { code: tickets[0]!.code, method: "QR" });
    const stats = await attendanceStats(event.id);
    expect(stats).toMatchObject({ present: 1, total: 3, byGate: [{ gate: "Entrée principale", count: 1 }] });
    expect(stats.recent.map((r) => r.result)).toEqual(["ALREADY_USED", "VALID"]);
  });
});
