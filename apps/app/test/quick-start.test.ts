import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createStarterOrganizationAndEvent } from "@/server/quickStart";

const rid = () => Math.random().toString(36).slice(2, 8);
const user = async () => {
  const u = await db.user.create({ data: { name: "Nora", email: `start.${rid()}@exemple.be`, emailVerified: true } });
  return { id: u.id, name: u.name, email: u.email };
};
const ev = { title: "Soirée de rentrée", startsAtLocal: "2027-02-20T20:00", locationName: "Salle des fêtes", city: "Namur", price: "12,50", quantity: 150 };

describe("création rapide : organisation et premier événement d'un coup", () => {
  it("adresse tirée du nom ; événement en brouillon avec son tarif", async () => {
    const name = `Club Jeunesse ${rid()}`;
    const { organization, event } = await createStarterOrganizationAndEvent(await user(), { name, type: "ASSOCIATION" }, ev, null);
    const org = await db.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(org.subdomain).toMatch(/^club-jeunesse-/);
    const row = await db.event.findUniqueOrThrow({ where: { id: event.id }, include: { ticketTypes: true } });
    expect([row.status, row.title, row.organizationId]).toEqual(["DRAFT", "Soirée de rentrée", org.id]);
    expect(row.ticketTypes.map((t) => [t.priceMinor, t.quantity])).toEqual([[1_250, 150]]);
  });

  it("adresse déjà prise : une variante est choisie", async () => {
    const name = `Cercle ${rid()}`;
    const a = await createStarterOrganizationAndEvent(await user(), { name, type: "ASSOCIATION" }, ev, null);
    const b = await createStarterOrganizationAndEvent(await user(), { name, type: "COMPANY" }, ev, null);
    const [oa, ob] = await Promise.all([a, b].map((x) => db.organization.findUniqueOrThrow({ where: { id: x.organization.id } })));
    expect(oa!.subdomain).not.toBe(ob!.subdomain);
    expect((ob!.subdomain ?? "").startsWith((oa!.subdomain ?? "").slice(0, 10))).toBe(true);
    expect(ob!.type).toBe("COMPANY");
  });

  it("sans prix ni nombre de places : billets gratuits, places illimitées", async () => {
    const { event } = await createStarterOrganizationAndEvent(
      await user(),
      { name: `Gratuit ${rid()}`, type: "ASSOCIATION" },
      { ...ev, price: "0", quantity: null },
      null,
    );
    const row = await db.event.findUniqueOrThrow({ where: { id: event.id }, include: { ticketTypes: true } });
    expect(row.ticketTypes.map((t) => [t.priceMinor, t.quantity])).toEqual([[0, null]]);
  });
});
