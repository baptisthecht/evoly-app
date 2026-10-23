import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { importContacts, parseContactsCsv } from "@/server/contactsImport";
import { findOrgContext } from "@/server/context";
import {
  platformSearch,
  reactivateOrganization,
  suspendOrganization,
} from "@/server/platform";

// import de contacts (P1, RGPD) et administration d'Evoly (recherche, suspension, réactivation)
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(o: { pro?: boolean } = {}) {
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
      name: `Cercle Solvay ${id}`,
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
  if (o.pro !== false)
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000),
      },
    });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  const staff = {
    user: { id: owner.id, email: owner.email, name: owner.name },
    role: "ADMIN",
    level: "ADMIN",
  } as never;
  return { ctx, org, staff, id };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("fichier de contacts", () => {
  it("point-virgule, en-têtes accentués, guillemets avec séparateur et guillemets doublés, marque d'ordre et lignes vides", () => {
    const rows = parseContactsCsv(
      '\uFEFFPrénom;Nom;E-mail;Langue\n\nLéa;Martin;LEA@Exemple.be;fr\n"Tom; dit ""Tommy""";Dubois;tom@exemple.be;nl\n',
    );
    expect(rows).toEqual([
      {
        email: "lea@exemple.be",
        firstName: "Léa",
        lastName: "Martin",
        locale: "fr",
      },
      {
        email: "tom@exemple.be",
        firstName: 'Tom; dit "Tommy"',
        lastName: "Dubois",
        locale: "nl",
      },
    ]);
  });

  it("sans en-tête : e-mail, prénom, nom ; virgule ou tabulation reconnues ; vide : rien", () => {
    expect(parseContactsCsv("ines@exemple.be,Inès,Benali")).toEqual([
      {
        email: "ines@exemple.be",
        firstName: "Inès",
        lastName: "Benali",
        locale: "",
      },
    ]);
    expect(parseContactsCsv("email\tprenom\nzoe@exemple.be\tZoé")).toEqual([
      { email: "zoe@exemple.be", firstName: "Zoé", lastName: "", locale: "" },
    ]);
    expect(parseContactsCsv(" \n \n")).toEqual([]);
  });
});

describe("import de contacts", () => {
  it("offre gratuite refusée ; consentement non certifié refusé", async () => {
    const free = await setup({ pro: false });
    await expect(
      importContacts(free.ctx, "lea@exemple.be", true),
    ).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx } = await setup();
    await expect(importContacts(ctx, "lea@exemple.be", false)).rejects.toEqual(
      refused("IMPORT_CONSENT_REQUIRED"),
    );
  });

  it("doublons et adresses invalides ignorés ; un contact désinscrit n'est jamais réabonné", async () => {
    const { ctx, org, id } = await setup();
    await db.contact.create({
      data: {
        organizationId: org.id,
        email: `parti.${id}@exemple.be`,
        marketingConsent: false,
        unsubscribedAt: new Date(),
      },
    });
    await importContacts(
      ctx,
      `email;prenom\nlea.${id}@exemple.be;Léa\nLEA.${id}@exemple.be;Léa\npas-une-adresse;Rien\nparti.${id}@exemple.be;Revenu\n`,
      true,
    );
    const contacts = await db.contact.findMany({
      where: { organizationId: org.id },
      orderBy: { email: "asc" },
    });
    expect(contacts.map((c) => c.email)).toEqual([
      `lea.${id}@exemple.be`,
      `parti.${id}@exemple.be`,
    ]);
    expect(
      contacts.find((c) => c.email === `lea.${id}@exemple.be`),
    ).toMatchObject({ marketingConsent: true, firstName: "Léa" });
    expect(
      contacts.find((c) => c.email === `parti.${id}@exemple.be`),
    ).toMatchObject({
      marketingConsent: false,
      unsubscribedAt: expect.any(Date),
    });
  });
});

describe("administration : recherche, suspension, réactivation", () => {
  it("recherche : au moins 2 caractères ; trouve l'organisation par son nom", async () => {
    const { org, id } = await setup();
    expect(await platformSearch(" a ")).toBeNull();
    const found = await platformSearch(`solvay ${id}`);
    expect(found?.organizations.map((o) => o.id)).toContain(org.id);
  });

  it("suspension puis réactivation inscrites à l'historique ; seule une organisation suspendue se réactive", async () => {
    const { org, staff } = await setup();
    await suspendOrganization(staff, org.id, "Fraude signalée par Stripe");
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: org.id } }))
        .status,
    ).toBe("SUSPENDED");
    await reactivateOrganization(staff, org.id);
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: org.id } }))
        .status,
    ).toBe("ACTIVE");
    const actions = (
      await db.auditLog.findMany({
        where: { organizationId: org.id },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "platform.organization_suspended",
        "platform.organization_reactivated",
      ]),
    );
    await expect(reactivateOrganization(staff, org.id)).rejects.toThrow();
  });
});
