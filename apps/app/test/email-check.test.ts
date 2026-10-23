import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkAddress } from "@/server/emailCheck";
import { cleanPendingAddresses, importLot } from "@/server/prospection";

const rid = () => Math.random().toString(36).slice(2, 10);
// DNS simulé : seuls ces domaines reçoivent des e-mails ; « lent.be » simule une erreur passagère
const MX = new Set(["cdbm.org", "theatre-les-aires.com", "salle.be"]);
const resolver = async (d: string) => {
  if (d === "lent.be")
    throw Object.assign(new Error("délai"), { code: "ETIMEOUT" });
  if (MX.has(d)) return [{ exchange: `mx.${d}`, priority: 10 }];
  throw Object.assign(new Error("introuvable"), { code: "ENOTFOUND" });
};

describe("adresses de prospection qui rebondiraient", () => {
  it("syntaxe, adresses d'exemple, mots collés au domaine (avec l'adresse probable), domaine sans serveur de messagerie ; une erreur passagère n'écarte rien", async () => {
    expect(await checkAddress("contact@salle.be", resolver)).toEqual({
      ok: true,
    });
    expect(await checkAddress("contact@@salle.be", resolver)).toMatchObject({
      ok: false,
      reason: "syntaxe incorrecte",
    });
    expect(await checkAddress("adresse@email.com", resolver)).toMatchObject({
      ok: false,
      reason: "adresse d'exemple",
    });
    expect(await checkAddress("jean.dupont@gmail.com", resolver)).toMatchObject(
      { ok: false, reason: "adresse d'exemple" },
    );
    expect(
      await checkAddress("administration@cdbm.orgdirection", resolver),
    ).toEqual({
      ok: false,
      reason: "extension inconnue (mot collé au domaine)",
      suggestion: "administration@cdbm.org",
    });
    expect(
      await checkAddress("contact@theatre-les-aires.compropositions", resolver),
    ).toMatchObject({ suggestion: "contact@theatre-les-aires.com" });
    expect(await checkAddress("contact@inconnu.comxyz", resolver)).toEqual({
      ok: false,
      reason: "extension inconnue (mot collé au domaine)",
    }); // pas d'adresse probable : son domaine ne reçoit rien
    expect(
      await checkAddress("contact@groupepoteletchabot.com", resolver),
    ).toMatchObject({
      ok: false,
      reason: "domaine sans serveur de messagerie",
    });
    expect(await checkAddress("contact@lent.be", resolver)).toEqual({
      ok: true,
    });
    expect(await checkAddress("contact@salle.be", null)).toEqual({ ok: true }); // sans DNS : syntaxe et extension seulement
  });

  it("import : les adresses invalides sont ignorées avec leur raison ; nettoyage des e-mails en attente : retirés, prospect écarté avec la raison en note", async () => {
    const lot = `test-${rid()}`;
    const report = await importLot({
      lot,
      emails: [
        {
          id: `${lot}-1`,
          a: `bon.${rid()}@salle.be`,
          organisation: "Salle",
          objet: "Bonjour",
          message: "Bonjour",
        },
        {
          id: `${lot}-2`,
          a: "adresse@email.com",
          organisation: "Exemple",
          objet: "Bonjour",
          message: "Bonjour",
        },
        {
          id: `${lot}-3`,
          a: `x.${rid()}@cdbm.orgdirection`,
          organisation: "CDBM",
          objet: "Bonjour",
          message: "Bonjour",
        },
      ],
    });
    expect(report.ignores.map((r) => r.raison)).toEqual([
      "adresse invalide : adresse d'exemple",
      expect.stringMatching(
        /^adresse invalide : extension inconnue \(mot collé au domaine\) \(sans doute x\.[a-z0-9]+@cdbm\.org\)$/,
      ), // sans DNS pendant les tests : l'adresse probable est quand même proposée
    ]);
    expect(report.ajoutes).toBe(1);
    const bad = `contact.${rid()}@groupepoteletchabot.com`;
    const report2 = await importLot({
      lot: `${lot}-b`,
      emails: [
        {
          id: `${lot}-4`,
          a: bad,
          organisation: "Groupe",
          objet: "Bonjour",
          message: "Bonjour",
        },
      ],
    });
    expect(report2.ajoutes).toBe(1); // sans DNS pendant les tests : importée, puis écartée par le nettoyage
    const r = await cleanPendingAddresses((a) => checkAddress(a, resolver), {
      lot: `${lot}-b`,
    }); // seulement ce lot : les autres tests tournent en parallèle
    expect(r.ecartees.filter((e) => e.a === bad)).toEqual([
      { a: bad, raison: "domaine sans serveur de messagerie" },
    ]);
    const p = await db.prospect.findUniqueOrThrow({
      where: { email: bad },
      include: { emails: true },
    });
    expect(p.status).toBe("EXCLU");
    expect(p.notes).toContain(
      "Adresse invalide : domaine sans serveur de messagerie",
    );
    expect(p.emails.every((e) => e.status === "RETIRE")).toBe(true);
  });
});
