import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { ticketsPdfFor } from "@/server/orders";
import { revertCheckIn } from "@/server/scanner";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const event = await db.event.create({ data: { organizationId: org.id, slug: `bal-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Bal ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 3 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50 } } }, include: { ticketTypes: true } });
  const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 2 }], locale: "fr" });
  await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false });
  const tickets = await db.ticket.findMany({ where: { orderId: r.orderId }, orderBy: { createdAt: "asc" } });
  return { id, ctx: { organization: { id: org.id }, user: { id: user.id } } as unknown as OrgContext, orderId: r.orderId, tickets };
}

describe("entrées et PDF des billets", () => {
  it("annulation d'une entrée : motif obligatoire, journal complété, billet de nouveau valable (RG-SCN-02)", async () => {
    const s = await setup();
    const t = s.tickets[0]!;
    await expect(revertCheckIn(s.ctx, t.id, "Scanné par erreur")).rejects.toThrow("CHECKIN_NOT_REVERTIBLE");
    await db.ticket.update({ where: { id: t.id }, data: { status: "CHECKED_IN", checkedInAt: new Date() } });
    await db.checkIn.create({ data: { eventId: t.eventId, ticketId: t.id, result: "VALID", scannedAt: new Date() } });
    await expect(revertCheckIn(s.ctx, t.id, "x")).rejects.toThrow("CHECKIN_REVERT_REASON");
    await revertCheckIn(s.ctx, t.id, "Scanné par erreur à la place d'un autre");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("VALID");
    const log = await db.checkIn.findMany({ where: { ticketId: t.id }, orderBy: { receivedAt: "asc" } });
    expect(log.map((c) => c.result)).toEqual(["VALID", "REVERTED"]);
    expect(log[1]!.note).toBe("Scanné par erreur à la place d'un autre");
  });

  it("PDF : un billet revendu est barré, sans QR code, les autres restent valables (section 9.12)", async () => {
    const s = await setup();
    await db.ticket.update({ where: { id: s.tickets[1]!.id }, data: { status: "VOID", voidReason: "RESOLD" } });
    const order = await db.order.findUniqueOrThrow({ where: { id: s.orderId }, include: { organization: { select: { name: true } }, event: true, tickets: { include: { ticketType: { select: { name: true } } }, orderBy: { createdAt: "asc" } } } });
    const file = `/tmp/billets-${s.id}.pdf`;
    writeFileSync(file, await ticketsPdfFor(order, "fr"));
    const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
    expect(text).toContain("BILLET REVENDU · NON VALABLE");
    expect(text.split("BILLET REVENDU").length - 1).toBe(1);
    expect(text).toContain(s.tickets[0]!.shortCode.split("").join(" "));
  });
});
