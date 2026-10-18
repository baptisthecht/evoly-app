import { normalizeAccessCode } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { OrgContext } from "@/server/context";
import { updateEventSettings, type EventSettingsInput } from "@/server/events";
import { accessCodeHash } from "@/server/questions";

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup() {
  const id = rid();
  const org = await db.organization.create({ data: { name: "Club", slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR" } });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date("2026-12-20T19:00:00Z"),
      status: "DRAFT",
      ticketTypes: { create: { name: "Fosse", priceMinor: 0, currency: "EUR", quantity: 50 } },
    },
    include: { ticketTypes: true },
  });
  const ctx = { organization: { id: org.id, country: "BE" }, user: { id: "u1" } } as unknown as OrgContext;
  return { ctx, event };
}
const input = (over: Partial<EventSettingsInput> = {}): EventSettingsInput =>
  ({
    title: "Gala",
    summary: "",
    startsAtLocal: "2026-12-20T20:00",
    endsAtLocal: "",
    timezone: "Europe/Brussels",
    locationType: "PHYSICAL",
    locationName: "Salle",
    addressLine1: "Rue Haute 1",
    postalCode: "1000",
    city: "Bruxelles",
    country: "BE",
    onlineUrl: "",
    capacity: null,
    maxTicketsPerOrder: 10,
    maxTicketsPerBuyer: null,
    visibility: "PUBLIC",
    accessCode: null,
    refundPolicy: "NON_REFUNDABLE",
    refundDeadlineLocal: null,
    salesStartLocal: null,
    salesEndLocal: null,
    resaleEnabled: false,
    resaleCutoffMinutes: 120,
    showResaleSection: true,
    ...over,
  }) as EventSettingsInput;
const hashOf = async (id: string) => (await db.event.findUniqueOrThrow({ where: { id } })).accessCodeHash;

describe("événement privé : code d'accès (RG-PUB-06)", () => {
  it("événement public : jamais de code, même s'il était privé avant", async () => {
    const s = await setup();
    await updateEventSettings(s.ctx, s.event.id, input({ visibility: "PRIVATE", accessCode: "GALA2026" }));
    expect(await hashOf(s.event.id)).not.toBeNull();
    await updateEventSettings(s.ctx, s.event.id, input({ visibility: "PUBLIC" }));
    expect(await hashOf(s.event.id)).toBeNull();
  });

  it("événement privé sans code : refusé", async () => {
    const s = await setup();
    await expect(updateEventSettings(s.ctx, s.event.id, input({ visibility: "PRIVATE", accessCode: "  " }))).rejects.toMatchObject({
      code: "ACCESS_CODE_REQUIRED",
    });
  });

  it("code stocké haché, jamais en clair, avec l'empreinte vérifiée à l'entrée de la page", async () => {
    const s = await setup();
    await updateEventSettings(s.ctx, s.event.id, input({ visibility: "PRIVATE", accessCode: "Gala-2026" }));
    const row = await db.event.findUniqueOrThrow({ where: { id: s.event.id } });
    expect(row.accessCodeHash).toBe(accessCodeHash(s.event.id, normalizeAccessCode("Gala-2026")!));
    expect(JSON.stringify(row)).not.toMatch(/gala-2026/i);
  });

  it("code laissé vide sur un événement déjà privé : le code existant est gardé", async () => {
    const s = await setup();
    await updateEventSettings(s.ctx, s.event.id, input({ visibility: "PRIVATE", accessCode: "GALA2026" }));
    const before = await hashOf(s.event.id);
    await updateEventSettings(s.ctx, s.event.id, input({ visibility: "PRIVATE", accessCode: "" }));
    expect(await hashOf(s.event.id)).toBe(before);
  });

  it("code invalide : refusé", async () => {
    const s = await setup();
    const bad = ["!!", "a", "€€€€"].find((c) => normalizeAccessCode(c) == null)!;
    await expect(updateEventSettings(s.ctx, s.event.id, input({ visibility: "PRIVATE", accessCode: bad }))).rejects.toMatchObject({
      code: "ACCESS_CODE_INVALID",
    });
  });
});

describe("réglages d'un événement : refus de cohérence", () => {
  it("fin des ventes avant leur début : refusée", async () => {
    const s = await setup();
    await expect(
      updateEventSettings(s.ctx, s.event.id, input({ salesStartLocal: "2026-12-10T10:00", salesEndLocal: "2026-12-01T10:00" })),
    ).rejects.toMatchObject({ code: "SALES_END_BEFORE_START" });
  });

  it("remboursable jusqu'à une date, sans la date : refusé", async () => {
    const s = await setup();
    await expect(updateEventSettings(s.ctx, s.event.id, input({ refundPolicy: "UNTIL_DEADLINE", refundDeadlineLocal: null }))).rejects.toMatchObject({
      code: "REFUND_DEADLINE_REQUIRED",
    });
  });

  it("jauge inférieure aux places déjà vendues ou retenues : refusée", async () => {
    const s = await setup();
    await db.ticketType.update({ where: { id: s.event.ticketTypes[0]!.id }, data: { quantitySold: 8, quantityHeld: 3 } });
    await expect(updateEventSettings(s.ctx, s.event.id, input({ capacity: 10 }))).rejects.toMatchObject({ code: "CAPACITY_BELOW_SOLD" });
    await updateEventSettings(s.ctx, s.event.id, input({ capacity: 11 }));
    expect((await db.event.findUniqueOrThrow({ where: { id: s.event.id } })).capacity).toBe(11);
  });
});
