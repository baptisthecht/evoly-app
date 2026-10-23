import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { loadPublicEvent } from "@/server/publicEvents";
import { createOption } from "@/server/options";
import { saveTableSettings } from "@/server/tables";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(plan: "pro" | "free", priceMinor = 30_000) {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille Dupont",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
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
  if (plan === "pro")
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE" },
    });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Table VIP",
          priceMinor,
          currency: "EUR",
          quantity: 10,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  return { event, type: event.ticketTypes[0]!, ctx };
}
const acheter = async (s: Awaited<ReturnType<typeof setup>>) => {
  const r = await reserveOrder({
    eventId: s.event.id,
    lines: [{ ticketTypeId: s.type.id, quantity: 1 }],
    locale: "fr",
  });
  await db.order.update({
    where: { id: r.orderId },
    data: {
      buyerEmail: `client.${rid()}@exemple.be`,
      buyerFirstName: "Alex",
      buyerLastName: "Martin",
    },
  });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  return db.order.findUniqueOrThrow({
    where: { id: r.orderId },
    include: {
      tickets: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      options: true,
    },
  });
};

describe("tables et forfaits (section 9.31)", () => {
  it("réservé à l'offre Pro (RG-TAB-06)", async () => {
    const s = await setup("free");
    await expect(
      saveTableSettings(s.ctx, s.event.id, s.type.id, {
        groupSize: 6,
        tableLabels: [],
        included: [],
      }),
    ).rejects.toMatchObject({
      code: "FEATURE_UNAVAILABLE",
    });
  });

  it("une table de 6 : 6 billets nommés, valeur par personne, commission par personne, bouteilles comprises, nombre verrouillé après la vente (RG-TAB-01, RG-TAB-02, RG-TAB-03)", async () => {
    const s = await setup("pro");
    const bouteille = await createOption(s.ctx, s.event.id, {
      name: "Bouteille",
      price: "80",
    });
    await saveTableSettings(s.ctx, s.event.id, s.type.id, {
      groupSize: 6,
      tableLabels: ["Carré Or"],
      included: [{ optionId: bouteille.id, quantity: 2 }],
    });
    const o1 = await acheter(s);
    expect(o1.totalMinor).toBe(30_000);
    expect(o1.applicationFeeMinor).toBe(600); // 6 personnes × 1 € (50 € par personne : 0,29 € + 2 %, au plafond Pro de 1 €)
    expect(o1.options).toEqual([
      expect.objectContaining({
        optionId: bouteille.id,
        quantity: 2,
        unitPriceMinor: 0,
      }),
    ]);
    expect(o1.tickets).toHaveLength(6);
    expect(new Set(o1.tickets.map((t) => t.tableLabel))).toEqual(
      new Set(["Carré Or"]),
    );
    expect(o1.tickets.reduce((n, t) => n + t.faceValueMinor, 0)).toBe(30_000);
    // la page de vente annonce le forfait
    const publique = await loadPublicEvent({ id: s.event.id });
    expect(publique!.ticketTypes[0]).toMatchObject({
      groupSize: 6,
      included: ["2 × Bouteille"],
    });
    const o2 = await acheter(s);
    expect(o2.tickets[0]!.tableLabel).toBe("Table 2");
    await expect(
      saveTableSettings(s.ctx, s.event.id, s.type.id, {
        groupSize: 8,
        tableLabels: [],
        included: [],
      }),
    ).rejects.toMatchObject({
      code: "TABLE_LOCKED",
    });
  });

  it("prix non divisible : les centimes d'arrondi vont au premier billet, la somme tombe juste", async () => {
    const s = await setup("pro", 25_000);
    await saveTableSettings(s.ctx, s.event.id, s.type.id, {
      groupSize: 6,
      tableLabels: [],
      included: [],
    });
    const o = await acheter(s);
    // billets créés ensemble, dans la même milliseconde : la base les rend dans un ordre quelconque (test instable, 18 octobre 2026)
    const values = o.tickets.map((t) => t.faceValueMinor).sort((x, y) => y - x);
    expect(values).toEqual([4170, 4166, 4166, 4166, 4166, 4166]); // une seule place porte les centimes d'arrondi
    expect(values.reduce((n, v) => n + v, 0)).toBe(25_000); // la somme tombe juste
    expect(o.tickets.every((t) => t.tableLabel === "Table 1")).toBe(true);
  });
});
