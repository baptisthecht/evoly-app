import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { importLot, retryEmail, scheduleLot, sendDueProspectEmails, sendNow, updateProspect, type Sender } from "@/server/prospection";

process.env.PROSPECTION_SMTP_URL = "smtp://test:test@localhost:2525";
process.env.PROSPECTION_FROM = "Baptist Hecht <baptist@exemple.fr>";
process.env.PROSPECTION_DAILY_CAP = "2";
process.env.PROSPECTION_2_SMTP_URL = "smtp://test2:test@localhost:2525";
process.env.PROSPECTION_2_FROM = "Evoly <hello@exemple.com>";
process.env.PROSPECTION_2_DAILY_CAP = "1";
process.env.PROSPECTION_DELAY_SECONDS = "120-300";

const partis: string[] = [];
const expediteurs: string[] = [];
const envoi: Sender = async (m) => {
  partis.push(m.to);
  expediteurs.push(m.from);
  return { messageId: `<${partis.length}@exemple.fr>` };
};
const mail = (i: number, x: Record<string, unknown> = {}) => ({
  id: `t-${i}`,
  a: `comite${i}@cercle${i}.be`,
  organisation: `Cercle ${i}`,
  objet: `Objet ${i}`,
  message: `Bonjour ${i}`,
  ...x,
});

describe("prospection depuis le back-office", () => {
  beforeEach(async () => {
    partis.length = 0;
    expediteurs.length = 0;
    await db.prospectEmail.deleteMany();
    await db.prospect.deleteMany();
  });

  it("import : champs vérifiés un à un, aucun doublon, organisations exclues ou déjà contactées écartées", async () => {
    const r = await importLot({ lot: "2026-10-27", emails: [mail(1), mail(2), mail(3, { objet: "" })] });
    expect(r.ajoutes).toBe(2);
    expect(r.ignores.map((i) => i.id)).toEqual(["t-3"]);
    expect((await importLot({ lot: "2026-10-27", emails: [mail(1)] })).ignores[0]!.raison).toBe("déjà importé (même identifiant)");
    expect((await importLot({ emails: [mail(9, { a: "COMITE1@cercle1.be", id: "autre" })] })).ignores[0]!.raison).toBe("déjà contactée ou déjà prévue");
    const p = await db.prospect.findUniqueOrThrow({ where: { email: "comite2@cercle2.be" } });
    await updateProspect(p.id, { status: "EXCLU", notes: "a demandé de ne plus écrire" });
    expect(await db.prospectEmail.count({ where: { prospectId: p.id, status: "RETIRE" } })).toBe(1);
    expect((await importLot({ emails: [mail(2, { id: "t-2b" })] })).ignores[0]!.raison).toBe("organisation exclue");
    await expect(importLot({ nimporte: "quoi" })).rejects.toMatchObject({ code: "PROSPECTION_LOT_INVALID" });
  });

  it("programmation espacée dans la limite du jour, puis un envoi par passage, jamais deux fois le même", async () => {
    await importLot({ lot: "L", emails: [1, 2, 3, 4, 5].map((i) => mail(i)) });
    const now = new Date();
    expect(await scheduleLot("L", now)).toEqual({ programmes: 3, restants: 2 });
    const quand = (await db.prospectEmail.findMany({ where: { status: "PROGRAMME" }, orderBy: { scheduledAt: "asc" } })).map((e) => e.scheduledAt!.getTime());
    expect(quand[0]).toBeGreaterThanOrEqual(now.getTime() + 10_000);
    for (let i = 1; i < quand.length; i++) expect(quand[i]! - quand[i - 1]!).toBeGreaterThanOrEqual(120_000);
    const plusTard = new Date(now.getTime() + 3_600_000);
    const [a, b] = await Promise.all([sendDueProspectEmails(plusTard, envoi), sendDueProspectEmails(plusTard, envoi)]);
    expect(a.sent + b.sent).toBeLessThanOrEqual(2);
    expect(new Set(partis).size).toBe(partis.length);
    while ((await sendDueProspectEmails(plusTard, envoi)).sent) {
      /* vide la file */
    }
    expect(partis.length).toBe(3);
    // deux boîtes : 2 e-mails depuis la première (limite 2), 1 depuis la seconde (limite 1)
    expect(expediteurs.filter((f) => f.includes("baptist@exemple.fr")).length).toBe(2);
    expect(expediteurs.filter((f) => f.includes("hello@exemple.com")).length).toBe(1);
    expect((await db.prospectEmail.findMany({ where: { status: "ENVOYE" }, select: { mailbox: true } })).map((e) => e.mailbox).sort()).toEqual([
      "baptist@exemple.fr",
      "baptist@exemple.fr",
      "hello@exemple.com",
    ]);
    expect(await sendDueProspectEmails(plusTard, envoi)).toEqual({ sent: 0 });
    const p = await db.prospect.findUniqueOrThrow({ where: { email: partis[0]! } });
    expect(p.status).toBe("CONTACTE");
    expect(p.lastContactAt).not.toBeNull();
    const reste = await db.prospectEmail.findFirstOrThrow({ where: { status: "A_ENVOYER" } });
    await expect(sendNow(reste.id, plusTard, envoi)).rejects.toMatchObject({ code: "PROSPECTION_DAILY_CAP" });
  });

  it("échec d'envoi : erreur claire sans l'adresse, puis remis à envoyer", async () => {
    await importLot({ emails: [mail(1)] });
    const e = await db.prospectEmail.findFirstOrThrow();
    const panne: Sender = async () => {
      throw new Error("550 boîte inconnue : comite1@cercle1.be");
    };
    await expect(sendNow(e.id, new Date(), panne)).rejects.toMatchObject({ code: "PROSPECTION_SEND_FAILED" });
    const apres = await db.prospectEmail.findUniqueOrThrow({ where: { id: e.id } });
    expect(apres.status).toBe("ECHEC");
    expect(apres.error).toContain("550 boîte inconnue");
    expect(apres.error).not.toContain("comite1@cercle1.be");
    await retryEmail(e.id);
    expect((await db.prospectEmail.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("A_ENVOYER");
  });
});
