import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyRetention } from "@/server/retention";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function evenement(orgId: string, startsAt: Date, endsAt: Date | null) {
  const id = rid();
  return db.event.create({
    data: {
      organizationId: orgId,
      slug: `ev-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Ev ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt,
      endsAt,
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 5 } },
    },
    include: { ticketTypes: true },
  });
}

describe("conservation des données du lot Conquête (section 13)", () => {
  it("liste d'attente supprimée le lendemain de l'événement (RG-ATT-05) ; ambassadeurs anonymisés 12 mois après, lien privé invalidé, ventes conservées (RG-AMB-07)", async () => {
    const id = rid();
    const org = await db.organization.create({ data: { name: `Org ${id}`, slug: `org-${id}`, subdomain: `org-${id}`, country: "BE", currency: "EUR" } });
    const now = new Date();
    const passe = await evenement(org.id, new Date(now.getTime() - 3 * DAY), new Date(now.getTime() - 2 * DAY));
    const sansFin = await evenement(org.id, new Date(now.getTime() - 2 * DAY), null);
    const avenir = await evenement(org.id, new Date(now.getTime() + 10 * DAY), null);
    const ancien = await evenement(org.id, new Date(now.getTime() - 400 * DAY), new Date(now.getTime() - 399 * DAY));
    const inscrit = (ev: { id: string; ticketTypes: { id: string }[] }) =>
      db.waitlistEntry.create({ data: { eventId: ev.id, ticketTypeId: ev.ticketTypes[0]!.id, email: `a.${rid()}@exemple.be`, token: `t-${rid()}` } });
    await inscrit(passe);
    await inscrit(sansFin);
    const garde = await inscrit(avenir);
    const ambassadeur = (ev: { id: string }, name: string) =>
      db.ambassador.create({
        data: { eventId: ev.id, name, email: `${name.toLowerCase()}@exemple.be`, code: `C${rid().toUpperCase()}`, statsToken: `s-${rid()}` },
      });
    const vieux = await ambassadeur(ancien, "Marie");
    const recent = await ambassadeur(passe, "Lucas");

    const r = await applyRetention(now);
    expect(r.waitlist).toBeGreaterThanOrEqual(2);
    expect(await db.waitlistEntry.count({ where: { eventId: { in: [passe.id, sansFin.id] } } })).toBe(0);
    expect(await db.waitlistEntry.findUnique({ where: { id: garde.id } })).not.toBeNull(); // événement à venir : gardé
    const v = await db.ambassador.findUniqueOrThrow({ where: { id: vieux.id } });
    expect([v.name, v.email, v.active, v.statsToken]).toEqual(["Ambassadeur", null, false, `anonyme-${vieux.id}`]); // ancien lien privé inutilisable
    expect(await db.ambassador.findUniqueOrThrow({ where: { id: recent.id } })).toMatchObject({ name: "Lucas", email: "lucas@exemple.be", active: true });
    // deuxième passage : plus rien à anonymiser pour cet ambassadeur
    expect((await applyRetention(now)).ambassadors).toBe(0);
  });
});
