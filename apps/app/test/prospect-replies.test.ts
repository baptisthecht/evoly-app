import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyReplies, planReplies } from "@/server/prospectReplies";

// import des réponses des prospects : statuts, notes et relances depuis un fichier préparé à partir des e-mails reçus
const rid = () => Math.random().toString(36).slice(2, 10);
const csv = (text: string) => ({
  name: "reponses.csv",
  bytes: new TextEncoder().encode(text),
});
async function prospects() {
  const id = rid();
  const mk = (
    who: string,
    status: "CONTACTE" | "CLIENT" | "EXCLU" = "CONTACTE",
  ) =>
    db.prospect.create({
      data: {
        email: `${who}.${id}@exemple.fr`,
        organisation: `${who} ${id}`,
        status,
      },
    });
  const [caroline, bal, client, exclu, auto] = await Promise.all([
    mk("caroline"),
    mk("bal"),
    mk("client", "CLIENT"),
    mk("exclu", "EXCLU"),
    mk("auto"),
  ]);
  return { id, caroline, bal, client, exclu, auto };
}

describe("import des réponses des prospects : aperçu", () => {
  it("colonnes en français, statuts écrits de plusieurs façons, inconnus et invalides signalés, protégés, ordre du fichier", async () => {
    const p = await prospects();
    const file = [
      "Adresse;Statut;Date;Note;Relance",
      `${p.caroline.email};à relancer;2026-10-26;Pas dispo mercredi;`,
      `${p.caroline.email};Rendez-vous;27/10/2026;Présentation samedi;`,
      `${p.bal.email};non livré;2026-10-25;Adresse inexistante;`,
      `${p.client.email};Pas intéressé;2026-10-25;Ancien client;`,
      `${p.exclu.email};Intéressé;2026-10-25;;`,
      `${p.auto.email};;2026-10-25;Absent jusqu'au 3 novembre;2026-11-04`,
      `inconnu.${p.id}@exemple.fr;Intéressé;2026-10-25;;`,
      `${p.bal.email};peut-être;2026-10-25;;`,
      `pas-une-adresse;Intéressé;;;`,
    ].join("\n");
    const { rows, counts } = await planReplies(csv(file));
    expect(
      rows.map((r) => [r.line, r.current, r.next, r.action, r.reason ?? null]),
    ).toEqual([
      [2, "CONTACTE", "A_RELANCER", "change", null],
      [3, "A_RELANCER", "RDV", "change", null], // la ligne suivante part du statut précédent
      [4, "CONTACTE", "EXCLU", "change", null],
      [5, "CLIENT", "PAS_INTERESSE", "protected", "CLIENT"],
      [6, "EXCLU", "INTERESSE", "protected", "EXCLU"],
      [7, "CONTACTE", null, "note", null],
      [8, null, "INTERESSE", "unknown", null],
      [9, null, null, "invalid", "STATUS"],
      [10, null, null, "invalid", "EMAIL"],
    ]);
    expect(counts).toEqual({
      change: 3,
      note: 1,
      same: 0,
      protected: 2,
      unknown: 1,
      invalid: 2,
    });
    expect(
      await db.prospect.findUniqueOrThrow({ where: { id: p.caroline.id } }),
    ).toMatchObject({ status: "CONTACTE" }); // rien d'enregistré
  });

  it("sans colonne d'adresse : refusé", async () => {
    await expect(
      planReplies(csv("Nom;Statut\nCaroline;Intéressé\n")),
    ).rejects.toMatchObject({ code: "REPLIES_NO_EMAIL_COLUMN" });
  });
});

describe("import des réponses des prospects : application", () => {
  it("statuts, date de première réponse, notes datées et historique ; non livré : messages en attente retirés ; relance ; inconnus jamais créés", async () => {
    const p = await prospects();
    await db.prospectEmail.create({
      data: {
        externalId: `bal-${p.id}`,
        lot: `lot-${p.id}`,
        prospectId: p.bal.id,
        toEmail: p.bal.email,
        subject: "Relance",
        body: "…",
        status: "PROGRAMME",
        scheduledAt: new Date("2026-11-02T09:00:00Z"),
      },
    });
    const file = [
      "email;statut;date;note;relance",
      `${p.caroline.email};Rendez-vous;2026-10-26;Présentation samedi 31 octobre;`,
      `${p.bal.email};Exclu;2026-10-25;Adresse inexistante (550);`,
      `${p.client.email};Pas intéressé;2026-10-25;Ancien client;`,
      `${p.auto.email};;2026-10-25;Absent jusqu'au 3 novembre;2026-11-04`,
      `inconnu.${p.id}@exemple.fr;Intéressé;2026-10-25;;`,
    ].join("\n");
    const r = await applyReplies(csv(file), new Date("2026-10-27T10:00:00Z"));
    expect(r.counts).toMatchObject({
      change: 2,
      note: 1,
      protected: 1,
      unknown: 1,
    });
    const caroline = await db.prospect.findUniqueOrThrow({
      where: { id: p.caroline.id },
      include: { activities: { orderBy: { createdAt: "asc" } } },
    });
    expect([
      caroline.status,
      caroline.respondedAt?.toISOString(),
      caroline.notes,
    ]).toEqual([
      "RDV",
      "2026-10-26T12:00:00.000Z",
      "26 octobre 2026 : Présentation samedi 31 octobre",
    ]);
    expect(caroline.activities.map((a) => a.label)).toEqual([
      "Statut : Contacté, en attente de réponse → Démo ou rendez-vous prévu",
      "Réponse importée : Présentation samedi 31 octobre",
    ]);
    expect(
      (
        await db.prospectEmail.findUniqueOrThrow({
          where: { externalId: `bal-${p.id}` },
        })
      ).status,
    ).toBe("RETIRE");
    expect(
      await db.prospect.findUniqueOrThrow({ where: { id: p.client.id } }),
    ).toMatchObject({
      status: "CLIENT",
      notes: "25 octobre 2026 : Ancien client",
    });
    const auto = await db.prospect.findUniqueOrThrow({
      where: { id: p.auto.id },
    });
    expect([
      auto.status,
      auto.nextActionAt?.toISOString().slice(0, 10),
    ]).toEqual(["CONTACTE", "2026-11-04"]);
    expect(
      await db.prospect.count({
        where: { email: `inconnu.${p.id}@exemple.fr` },
      }),
    ).toBe(0);
  });
});
