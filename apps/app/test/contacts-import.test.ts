import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { OrgContext } from "@/server/context";
import { importContacts, parseContactsCsv } from "@/server/contactsImport";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(features: string[] = ["EMAIL_MARKETING"]) {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const user = await db.user.create({ data: { name: "Orga", email: `orga.${id}@exemple.be`, emailVerified: true } });
  const ctx = {
    organization: org,
    user: { id: user.id, name: "Orga", email: user.email },
    features,
    membership: { status: "ACTIVE", systemRole: "OWNER", permissions: ["MARKETING_MANAGE"], roleName: "Propriétaire" },
  } as unknown as OrgContext;
  return { id, org, ctx };
}

describe("import de contacts (P1)", () => {
  it("lit un CSV français à points-virgules, avec guillemets, ou sans en-tête", () => {
    expect(parseContactsCsv('\uFEFFE-mail;Prénom;Nom\nLea@Exemple.be;Léa;"Martin; jr"\n')).toEqual([
      { email: "lea@exemple.be", firstName: "Léa", lastName: "Martin; jr", locale: "" },
    ]);
    expect(parseContactsCsv("tom@exemple.be,Tom,Dupont")).toEqual([{ email: "tom@exemple.be", firstName: "Tom", lastName: "Dupont", locale: "" }]);
    expect(parseContactsCsv("Nom,Prénom,Email,Langue\nDupont,Ana,ana@exemple.es,es")[0]).toEqual({
      email: "ana@exemple.es",
      firstName: "Ana",
      lastName: "Dupont",
      locale: "es",
    });
  });

  it("crée avec la source « import », ignore doublons et adresses invalides, ne réabonne jamais un désinscrit", async () => {
    const s = await setup();
    await db.contact.create({ data: { organizationId: s.org.id, email: `parti.${s.id}@exemple.be`, marketingConsent: false, unsubscribedAt: new Date() } });
    const csv = `email;prénom\nnouveau.${s.id}@exemple.be;Léa\nNOUVEAU.${s.id}@exemple.be;Léa\npas-une-adresse;X\nparti.${s.id}@exemple.be;Paul`;
    expect(await importContacts(s.ctx, csv, true)).toEqual({ created: 1, updated: 0, unsubscribed: 1, invalid: 1 });
    const c = await db.contact.findFirstOrThrow({ where: { organizationId: s.org.id, email: `nouveau.${s.id}@exemple.be` } });
    expect(c).toMatchObject({ firstName: "Léa", marketingConsent: true, consentSource: "IMPORT" });
    const gone = await db.contact.findFirstOrThrow({ where: { organizationId: s.org.id, email: `parti.${s.id}@exemple.be` } });
    expect(gone.marketingConsent).toBe(false);
    expect(gone.unsubscribedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { organizationId: s.org.id, action: "contacts.import" } })).toBe(1);
  });

  it("refusé sans certification du consentement ou sans l'offre Pro", async () => {
    const s = await setup();
    await expect(importContacts(s.ctx, "a@exemple.be", false)).rejects.toMatchObject({ code: "IMPORT_CONSENT_REQUIRED" });
    const free = await setup([]);
    await expect(importContacts(free.ctx, "a@exemple.be", true)).rejects.toMatchObject({ code: "PRO_REQUIRED" });
  });
});
