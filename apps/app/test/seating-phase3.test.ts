import { describe, expect, it } from "vitest";

process.env.ANTHROPIC_API_KEY = "cle-de-test";
const { db } = await import("@/lib/db");
const { reserveOrder, submitBuyer } = await import("@/server/checkout");
const { getPlans } = await import("@/server/plans");
const { applySeatingTemplate, setSeatChoice, setSeatingMode } = await import("@/server/seating");
const { seatSalesHeat, seatingEditor, setBlockView } = await import("@/server/seatingEditor");
const { normalizePhotoPlan, planFromPhoto } = await import("@/server/seatingPhoto");
type Ctx = import("@/server/context").OrgContext;

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup() {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({ data: { name: `Salle ${id}`, slug: `salle-${id}`, subdomain: `salle-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const event = await db.event.create({ data: { organizationId: org.id, slug: `bal-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Bal ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 9 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 0 }] } }, include: { ticketTypes: true } });
  const ctx = { organization: { id: org.id }, user: { id: user.id }, features: (await getPlans()).pro.features } as unknown as Ctx;
  return { event, ctx, type: event.ticketTypes[0]! };
}

describe("plan de salle, phase 3 (section 9.9)", () => {
  it("carte de chaleur : ordre des ventes et rangs vendus en premier ; photo de vue, même avec une place vendue", async () => {
    const { event, ctx, type } = await setup();
    await applySeatingTemplate(ctx, event.id, "hall", { rows: 2, seatsFirst: 6, seatsLast: 6, centerAisle: false, categories: 1 });
    await setSeatingMode(ctx, event.id, true);
    await setSeatChoice(ctx, event.id, true);
    const seat = async (row: string, label: string) => (await db.seat.findFirstOrThrow({ where: { label, row: { name: row, seatingMap: { eventId: event.id } } } })).id;
    const pairs: Array<[string, string, string]> = [["A", "1", "2"], ["A", "3", "4"], ["A", "5", "6"], ["B", "1", "2"], ["B", "3", "4"], ["B", "5", "6"]];
    const start = Date.now() - 10 * 86_400_000;
    for (const [i, [row, a, b]] of pairs.entries()) {
      const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: type.id, quantity: 2 }], locale: "fr", seatIds: [await seat(row, a), await seat(row, b)] });
      await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${i}.${rid()}@exemple.be`, marketingOptIn: false });
      await db.order.update({ where: { id: r.orderId }, data: { paidAt: new Date(start + i * 86_400_000) } });
    }
    const heat = (await seatSalesHeat(ctx, event.id))!;
    expect(heat).toMatchObject({ sold: 12, total: 12, fastRows: ["A"], slowRows: [] });
    const h = (row: string, label: string) => heat.seats.find((s) => s.row === row && s.label === label)!.heat;
    expect(h("A", "1")).toBe(0);
    expect(h("B", "6")).toBe(1);

    // photo de vue sur un bloc dont des places sont vendues : ajoutée puis retirée, places intactes
    const block = (await seatingEditor(ctx, event.id)).blocks.find((b) => b.kind === "ROWS")!;
    const sharp = (await import("sharp")).default;
    const jpeg = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: "#FFB8E8" } }).jpeg().toBuffer());
    const url = await setBlockView(ctx, event.id, block.id, jpeg);
    expect(url).toMatch(/\/events\/.+\/view-[a-z0-9]+\.jpg$/);
    expect((await seatingEditor(ctx, event.id)).blocks.find((b) => b.id === block.id)!.params.viewUrl).toBe(url);
    expect(await db.seat.count({ where: { row: { blockId: block.id }, status: "SOLD" } })).toBe(12);
    expect(await setBlockView(ctx, event.id, block.id, null)).toBeNull();
    expect((await seatingEditor(ctx, event.id)).blocks.find((b) => b.id === block.id)!.params.viewUrl).toBeUndefined();
  });

  it("plan d'après une photo : réponse de l'IA validée comme une saisie manuelle, proposée sans être appliquée", async () => {
    const { event, ctx } = await setup();
    const raw = { categories: 2, blocks: [{ kind: "SHAPE", name: "Scène", x: 0, y: -80, params: { shape: "stage", width: 360, height: 56, label: "SCÈNE" } }, { kind: "ROWS", name: "Parterre", x: 0, y: 40, category: 2, params: { rows: 6, seatsFirst: 12, seatsLast: 16, curve: 0.4, centerAisle: true } }, { kind: "BALCON_INCONNU", name: "?" }] };
    const plan = normalizePhotoPlan(raw);
    expect(plan.categories.map((c) => c.key)).toEqual(["c1", "c2"]);
    expect(plan.blocks.map((b) => b.kind)).toEqual(["SHAPE", "ROWS"]);
    expect(plan.blocks[1]!.params).toMatchObject({ rows: 6, seatGap: 30, categories: ["c2"] });
    expect(plan.focus).toEqual({ x: 0, y: -80 });
    expect(() => normalizePhotoPlan({ categories: 1, blocks: [{ kind: "SHAPE", name: "Scène", x: 0, y: 0, params: { shape: "stage", width: 100, height: 40 } }] })).toThrow("PHOTO_PLAN_UNREADABLE");

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    let sent: { model: string; messages: Array<{ content: Array<{ type: string }> }> } | null = null;
    const fake = (async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ content: [{ type: "text", text: "Voici le plan :\n```json\n" + JSON.stringify(raw) + "\n```" }] }), { status: 200 });
    }) as typeof fetch;
    const fromPhoto = await planFromPhoto(ctx, event.id, png, fake);
    expect(fromPhoto.blocks).toHaveLength(2);
    expect(sent!.messages[0]!.content.map((c) => c.type)).toEqual(["image", "text"]);
    expect(await db.seatingBlock.count({ where: { seatingMap: { eventId: event.id } } })).toBe(0); // rien d'appliqué
    const failing = (async () => new Response("erreur", { status: 529 })) as typeof fetch;
    await expect(planFromPhoto(ctx, event.id, png, failing)).rejects.toThrow("PHOTO_PLAN_FAILED");
  });
});
