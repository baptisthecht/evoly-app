import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { searchContacts } from "@/server/contacts";
import type { OrgContext } from "@/server/context";

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup() {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
    },
  });
  const add = (
    email: string,
    firstName: string,
    lastName: string,
    consent: boolean,
    unsubscribed = false,
  ) =>
    db.contact.create({
      data: {
        organizationId: org.id,
        email: `${email}.${id}@exemple.be`,
        firstName,
        lastName,
        marketingConsent: consent,
        unsubscribedAt: unsubscribed ? new Date() : null,
      },
    });
  const lea = await add("lea", "Léa", "Martin", true);
  const tom = await add("tom", "Tom", "Dubois", false);
  const zoe = await add("zoe", "Zoé", "Lambert", true, true); // avait consenti, puis s'est désinscrite
  return {
    id,
    org,
    lea,
    tom,
    zoe,
    ctx: { organization: { id: org.id } } as unknown as OrgContext,
  };
}
const ids = async (
  ctx: OrgContext,
  opts: Parameters<typeof searchContacts>[1],
) => (await searchContacts(ctx, opts)).rows.map((c) => c.id).sort();

describe("contacts de l'organisation (US-MKT-04, RGPD)", () => {
  it("recherche par e-mail, prénom ou nom, sans tenir compte des majuscules", async () => {
    const s = await setup();
    expect(await ids(s.ctx, { q: `LEA.${s.id}` })).toEqual([s.lea.id]);
    expect(await ids(s.ctx, { q: "tom" })).toEqual([s.tom.id]);
    expect(await ids(s.ctx, { q: "LAMBERT" })).toEqual([s.zoe.id]);
    expect(await ids(s.ctx, { q: "personne" })).toEqual([]);
  });

  it("consentants : jamais un contact désinscrit, même s'il avait consenti", async () => {
    const s = await setup();
    expect(await ids(s.ctx, { filter: "CONSENTING" })).toEqual([s.lea.id]);
  });

  it("désinscrits, et compteurs de l'en-tête", async () => {
    const s = await setup();
    const r = await searchContacts(s.ctx, { filter: "UNSUBSCRIBED" });
    expect(r.rows.map((c) => c.id)).toEqual([s.zoe.id]);
    expect(r.stats).toEqual({ all: 3, consenting: 1, unsubscribed: 1 });
    expect((await searchContacts(s.ctx, { filter: "ALL" })).total).toBe(3);
  });

  it("cloisonnement entre organisations, et pagination par 50", async () => {
    const s = await setup();
    const other = await setup();
    expect(await ids(other.ctx, { q: `lea.${s.id}` })).toEqual([]);
    await db.contact.createMany({
      data: Array.from({ length: 52 }, (_, i) => ({
        organizationId: s.org.id,
        email: `p${i}.${s.id}@exemple.be`,
      })),
    });
    const first = await searchContacts(s.ctx, { page: 0 });
    const second = await searchContacts(s.ctx, { page: 1 });
    expect([
      first.rows.length,
      second.rows.length,
      first.total,
      first.pages,
    ]).toEqual([50, 5, 55, 2]);
    expect((await searchContacts(s.ctx, { page: -3 })).rows.length).toBe(50); // une page négative revient à la première
  });
});
