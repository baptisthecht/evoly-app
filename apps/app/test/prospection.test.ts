import { beforeEach, describe, expect, it } from "vitest";
import { zonedLocalToUtc } from "@evoly/core";
import { db } from "@/lib/db";
import {
  availability,
  importLot,
  openPassword,
  rampCap,
  retryEmail,
  saveMailbox,
  scheduleWaiting,
  sendDueProspectEmails,
  sendNow,
  setMailboxActive,
  updateProspect,
  type Sender,
} from "@/server/prospection";

process.env.PROSPECTION_DELAY_SECONDS = "120-300";
const DAY = 86_400_000;
const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
const NOW = zonedLocalToUtc(`${iso(new Date())}T10:00`, "Europe/Brussels"); // heure fixe : pas de surprise autour de minuit
const partis: { to: string; from: string }[] = [];
const envoi: Sender = async (m) => {
  partis.push({ to: m.to, from: m.from });
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

async function boites() {
  const a = await saveMailbox({
    fromName: "Baptist Hecht (Evoly)",
    address: "baptist@exemple.fr",
    smtpHost: "smtp.exemple.fr",
    password: "secret-a",
    maxPerDay: 3,
    startedAt: iso(new Date(NOW.getTime() - 30 * DAY)),
  });
  const b = await saveMailbox({
    fromName: "Baptist Hecht (Evoly)",
    address: "hello@exemple.com",
    smtpHost: "smtp.exemple.com",
    password: "secret-b",
    maxPerDay: 2,
    startedAt: iso(NOW),
  });
  return { a, b };
}
const vider = async (quand: Date) => {
  while ((await sendDueProspectEmails(quand, envoi)).sent) {
    /* envoie tout ce qui est dû */
  }
};

describe("prospection : boîtes du back-office, disponibilités et répartition", () => {
  beforeEach(async () => {
    partis.length = 0;
    await db.prospectEmail.deleteMany();
    await db.prospect.deleteMany();
    await db.prospectMailbox.deleteMany();
  });

  it("montée en charge selon la date d'ajout, plafonnée par la boîte ; mot de passe chiffré", async () => {
    expect(rampCap(NOW, 40, NOW)).toBe(15);
    expect(rampCap(new Date(NOW.getTime() - 8 * DAY), 40, NOW)).toBe(25);
    expect(rampCap(new Date(NOW.getTime() - 20 * DAY), 40, NOW)).toBe(40);
    expect(rampCap(NOW, 10, NOW)).toBe(10);
    expect(rampCap(new Date(NOW.getTime() + 2 * DAY), 40, NOW)).toBe(0);
    const { a } = await boites();
    expect(a.passwordEnc).not.toContain("secret-a");
    expect(openPassword(a.passwordEnc)).toBe("secret-a");
    expect((await availability(NOW)).total).toBe(5);
  });

  it("lot réparti selon la place de chaque boîte, envois en parallèle sans doublon, le reste part le lendemain", async () => {
    const { a, b } = await boites();
    const r = await importLot({ lot: "L", emails: [1, 2, 3, 4, 5, 6, 7].map((i) => mail(i)) }, NOW);
    expect(r).toMatchObject({ ajoutes: 7, programmes: 5, enAttente: 2 });
    expect(Object.fromEntries(r.parBoite.map((p) => [p.address, p.count]))).toEqual({ "baptist@exemple.fr": 3, "hello@exemple.com": 2 });
    expect((await availability(NOW)).total).toBe(0);
    for (const box of [a, b]) {
      const t = (await db.prospectEmail.findMany({ where: { mailboxId: box.id }, orderBy: { scheduledAt: "asc" } })).map((e) => e.scheduledAt!.getTime());
      for (let i = 1; i < t.length; i++) expect(t[i]! - t[i - 1]!).toBeGreaterThanOrEqual(120_000);
    }
    const plusTard = new Date(NOW.getTime() + 3 * 3_600_000);
    await Promise.all([sendDueProspectEmails(plusTard, envoi), sendDueProspectEmails(plusTard, envoi)]);
    await vider(plusTard);
    expect(partis).toHaveLength(5);
    expect(new Set(partis.map((p) => p.to)).size).toBe(5);
    expect(partis.filter((p) => p.from.includes("baptist@exemple.fr"))).toHaveLength(3);
    expect(partis.filter((p) => p.from.includes("hello@exemple.com"))).toHaveLength(2);
    const lendemain = new Date(NOW.getTime() + DAY);
    expect(await scheduleWaiting(lendemain)).toMatchObject({ programmes: 2, enAttente: 0 });
    await vider(new Date(lendemain.getTime() + 3 * 3_600_000));
    expect(partis).toHaveLength(7);
    expect(await db.prospect.count({ where: { status: "CONTACTE" } })).toBe(7);
  });

  it("désactiver une boîte remet ses e-mails programmés en attente", async () => {
    const { b } = await boites();
    await importLot({ emails: [1, 2, 3, 4, 5].map((i) => mail(i)) }, NOW);
    expect(await db.prospectEmail.count({ where: { mailboxId: b.id, status: "PROGRAMME" } })).toBe(2);
    await setMailboxActive(b.id, false);
    expect(await db.prospectEmail.count({ where: { mailboxId: b.id } })).toBe(0);
    expect(await db.prospectEmail.count({ where: { status: "A_ENVOYER" } })).toBe(2);
    expect((await availability(NOW)).rows.map((r) => r.box.address)).toEqual(["baptist@exemple.fr"]);
  });

  it("aucun doublon, organisations exclues écartées, échec d'envoi sans l'adresse dans l'erreur", async () => {
    await boites();
    const r = await importLot({ lot: "L", emails: [mail(1), mail(2), mail(3, { objet: "" })] }, NOW);
    expect(r.ignores.map((i) => i.id)).toEqual(["t-3"]);
    expect((await importLot({ emails: [mail(1)] }, NOW)).ignores[0]!.raison).toBe("déjà importé (même identifiant)");
    const p = await db.prospect.findUniqueOrThrow({ where: { email: "comite2@cercle2.be" } });
    await updateProspect(p.id, { status: "EXCLU", notes: "" });
    expect((await importLot({ emails: [mail(2, { id: "t-2b" })] }, NOW)).ignores[0]!.raison).toBe("organisation exclue");
    const e = await db.prospectEmail.findFirstOrThrow({ where: { externalId: "t-1" } });
    const panne: Sender = async () => {
      throw new Error("550 boîte inconnue : comite1@cercle1.be");
    };
    await expect(sendNow(e.id, NOW, panne)).rejects.toMatchObject({ code: "PROSPECTION_SEND_FAILED" });
    const apres = await db.prospectEmail.findUniqueOrThrow({ where: { id: e.id } });
    expect(apres.status).toBe("ECHEC");
    expect(apres.error).not.toContain("comite1@cercle1.be");
    await retryEmail(e.id);
    expect((await db.prospectEmail.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("A_ENVOYER");
  });
});
