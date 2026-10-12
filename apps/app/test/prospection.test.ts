import { beforeEach, describe, expect, it } from "vitest";
import { zonedLocalToUtc } from "@evoly/core";
import { db } from "@/lib/db";
import {
  availability,
  importLot,
  openPassword,
  rampCap,
  rampSchedule,
  rebalance,
  setMailboxLimit,
  listProspects,
  pipelineStats,
  prospectsCsv,
  retryEmail,
  saveMailbox,
  scheduleWaiting,
  sendDueProspectEmails,
  sendNow,
  setMailboxActive,
  updateProspect,
  sendTest,
  type Copier,
  type Sender,
} from "@/server/prospection";

process.env.PROSPECTION_DELAY_SECONDS = "120-300";
const DAY = 86_400_000;
const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
const NOW = zonedLocalToUtc(`${iso(new Date())}T10:00`, "Europe/Brussels"); // heure fixe : pas de surprise autour de minuit
const partis: { to: string; from: string }[] = [];
const envoi: Sender = async (m) => {
  partis.push({ to: m.to, from: m.from });
};
const copies: string[] = [];
const copie: Copier = async (raw) => {
  copies.push(raw.toString("utf8"));
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
  while ((await sendDueProspectEmails(quand, envoi, copie)).sent) {
    /* envoie tout ce qui est dû */
  }
};

describe("prospection : boîtes du back-office, disponibilités et répartition", () => {
  beforeEach(async () => {
    partis.length = 0;
    copies.length = 0;
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

  it("lot réparti selon la place de chaque boîte, le surplus programmé les jours suivants, envois en parallèle sans doublon", async () => {
    const { a, b } = await boites();
    const r = await importLot({ lot: "L", emails: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => mail(i)) }, NOW);
    expect(r).toMatchObject({ ajoutes: 12, programmes: 12, enAttente: 0 });
    expect(r.parJour.map((j) => j.count)).toEqual([5, 5, 2]); // 3 + 2 par jour
    expect(r.parJour.map((j) => j.jour)).toEqual([0, 1, 2].map((k) => iso(new Date(NOW.getTime() + k * DAY))));
    expect((await availability(NOW)).total).toBe(0);
    const tous = await db.prospectEmail.findMany({ orderBy: { scheduledAt: "asc" } });
    for (const e of tous) {
      const h = new Intl.DateTimeFormat("fr-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(e.scheduledAt!);
      expect(h >= "08:30" && h < "19:00").toBe(true);
    }
    for (const box of [a, b]) {
      const t = tous.filter((e) => e.mailboxId === box.id).map((e) => e.scheduledAt!.getTime());
      for (let i = 1; i < t.length; i++) expect(t[i]! - t[i - 1]!).toBeGreaterThanOrEqual(120_000);
    }
    const plusTard = new Date(NOW.getTime() + 3 * 3_600_000);
    await Promise.all([sendDueProspectEmails(plusTard, envoi, copie), sendDueProspectEmails(plusTard, envoi, copie)]);
    await vider(plusTard);
    expect(partis).toHaveLength(5);
    expect(new Set(partis.map((p) => p.to)).size).toBe(5);
    expect(partis.filter((p) => p.from.includes("baptist@exemple.fr"))).toHaveLength(3);
    expect(partis.filter((p) => p.from.includes("hello@exemple.com"))).toHaveLength(2);
    await vider(zonedLocalToUtc(`${iso(new Date(NOW.getTime() + DAY))}T13:00`, "Europe/Brussels"));
    expect(partis).toHaveLength(10);
    await vider(zonedLocalToUtc(`${iso(new Date(NOW.getTime() + 2 * DAY))}T13:00`, "Europe/Brussels"));
    expect(partis).toHaveLength(12);
    expect(await db.prospect.count({ where: { status: "CONTACTE" } })).toBe(12);
  });

  it("lot collé après la plage d'envoi : rien ne part le soir, tout est programmé dès le lendemain", async () => {
    await boites();
    const soir = zonedLocalToUtc(`${iso(NOW)}T21:30`, "Europe/Brussels");
    const r = await importLot({ emails: [1, 2, 3].map((i) => mail(i)) }, soir);
    expect(r.parJour).toEqual([{ jour: iso(new Date(NOW.getTime() + DAY)), count: 3 }]);
    expect((await sendDueProspectEmails(new Date(soir.getTime() + 3_600_000), envoi, copie)).sent).toBe(0);
  });

  it("ajouter une boîte avance les envois des jours suivants ; en retirer une les reporte sur les autres", async () => {
    const { b } = await boites();
    const fixe = (_a: number, b: number) => b; // tirage fixe : premier envoi à 90 s, hors de la minute protégée
    await importLot({ emails: Array.from({ length: 12 }, (_, i) => mail(i + 1)) }, NOW, fixe);
    const parJour = async () => {
      const rows = await db.prospectEmail.findMany({ where: { status: "PROGRAMME" }, select: { scheduledAt: true } });
      const m = new Map<string, number>();
      for (const r of rows) m.set(iso(r.scheduledAt!), (m.get(iso(r.scheduledAt!)) ?? 0) + 1);
      return [...m.entries()].sort().map(([, n]) => n);
    };
    expect(await parJour()).toEqual([5, 5, 2]);
    const c = await saveMailbox({
      fromName: "Baptist",
      address: "hey@exemple.org",
      smtpHost: "smtp.exemple.org",
      password: "secret-c",
      maxPerDay: 4,
      startedAt: iso(new Date(NOW.getTime() - 30 * DAY)),
    });
    const r = await rebalance(NOW, fixe);
    expect(r).toMatchObject({ programmes: 12, enAttente: 0 });
    expect(await parJour()).toEqual([9, 3]); // 3 + 2 + 4 aujourd'hui
    expect(await db.prospectEmail.count({ where: { mailboxId: c.id, scheduledAt: { lt: new Date(NOW.getTime() + DAY / 2) } } })).toBe(4);
    await setMailboxActive(b.id, false);
    await rebalance(NOW, fixe);
    expect(await db.prospectEmail.count({ where: { mailboxId: b.id } })).toBe(0);
    expect(await db.prospectEmail.count({ where: { status: "A_ENVOYER" } })).toBe(0);
    expect(await parJour()).toEqual([7, 5]); // 3 + 4 par jour sans la boîte B
  });

  it("aucun doublon, organisations exclues écartées, échec d'envoi sans l'adresse dans l'erreur", async () => {
    await boites();
    const r = await importLot({ lot: "L", emails: [mail(1), mail(2), mail(3, { objet: "" })] }, NOW);
    expect(r.ignores.map((i) => i.id)).toEqual(["t-3"]);
    const recolle = await importLot({ emails: [mail(1, { objet: "Nouvel objet", message: "Nouveau texte" })] }, NOW);
    expect(recolle).toMatchObject({ ajoutes: 0, misAJour: 1, ignores: [] });
    expect(await db.prospectEmail.findUniqueOrThrow({ where: { externalId: "t-1" } })).toMatchObject({ subject: "Nouvel objet", body: "Nouveau texte" });
    const p = await db.prospect.findUniqueOrThrow({ where: { email: "comite2@cercle2.be" } });
    await updateProspect(p.id, { status: "EXCLU", notes: "" });
    expect((await importLot({ emails: [mail(2, { id: "t-2b" })] }, NOW)).ignores[0]!.raison).toBe("organisation exclue");
    const e = await db.prospectEmail.findFirstOrThrow({ where: { externalId: "t-1" } });
    const panne: Sender = async () => {
      throw new Error("550 boîte inconnue : comite1@cercle1.be");
    };
    await expect(sendNow(e.id, NOW, panne, copie)).rejects.toMatchObject({ code: "PROSPECTION_SEND_FAILED" });
    const apres = await db.prospectEmail.findUniqueOrThrow({ where: { id: e.id } });
    expect(apres.status).toBe("ECHEC");
    expect(apres.error).not.toContain("comite1@cercle1.be");
    await retryEmail(e.id);
    expect((await db.prospectEmail.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("A_ENVOYER");
  });

  it("chaque envoi est rangé dans « Envoyés » ; une copie impossible n'annule pas l'envoi et se rattrape ensuite", async () => {
    const { a } = await boites();
    await importLot({ emails: [1, 2].map((i) => mail(i)) }, NOW);
    const panne: Copier = async () => {
      throw new Error("IMAP indisponible");
    };
    const plusTard = new Date(NOW.getTime() + 3 * 3_600_000);
    while ((await sendDueProspectEmails(plusTard, envoi, panne)).sent) {
      /* envoie sans pouvoir copier */
    }
    expect(partis).toHaveLength(2);
    expect(await db.prospectEmail.count({ where: { status: "ENVOYE", copiedAt: null } })).toBe(2);
    expect((await sendDueProspectEmails(plusTard, envoi, copie)).filed).toBe(2);
    expect(await db.prospectEmail.count({ where: { copiedAt: null } })).toBe(0);
    expect(copies[0]).toContain("Subject: Objet");
    expect(copies[0]).toMatch(/Message-ID: <[a-z0-9]+@exemple\.(fr|com)>/);
    expect((await sendTest(a.id, "", envoi, copie)).ok).toBe(true);
    expect(partis.at(-1)!.to).toBe("baptist@exemple.fr");
  });

  it("Gmail range déjà ses envois : aucune seconde copie dans « Envoyés »", async () => {
    await saveMailbox({
      fromName: "Baptist",
      address: "baptist@gmail.com",
      smtpHost: "smtp.gmail.com",
      password: "mdp-application",
      maxPerDay: 3,
      startedAt: iso(new Date(NOW.getTime() - 30 * DAY)),
    });
    await importLot({ emails: [mail(1)] }, NOW);
    await vider(new Date(NOW.getTime() + 3 * 3_600_000));
    expect(partis).toHaveLength(1);
    expect(copies).toHaveLength(0);
    expect(await db.prospectEmail.count({ where: { copiedAt: null } })).toBe(0);
  });

  it("calendrier de montée en charge affiché : 15 puis 25 puis le plafond, avec leurs dates", () => {
    const debut = zonedLocalToUtc("2026-10-11T00:00", "Europe/Brussels");
    const vu = zonedLocalToUtc("2026-10-11T15:00", "Europe/Brussels");
    expect(rampSchedule(debut, 40, vu).map((st) => [iso(new Date(st.from)), st.perDay])).toEqual([
      ["2026-10-11", 15],
      ["2026-10-18", 25],
      ["2026-10-25", 40],
    ]);
    expect(rampSchedule(debut, 40, zonedLocalToUtc("2026-10-20T10:00", "Europe/Brussels")).map((st) => st.perDay)).toEqual([25, 40]);
    expect(rampSchedule(debut, 12, vu).map((st) => st.perDay)).toEqual([12]);
  });

  it("un lot recollé ne touche jamais un e-mail déjà envoyé", async () => {
    await boites();
    await importLot({ emails: [mail(1)] }, NOW);
    await vider(new Date(NOW.getTime() + 3 * 3_600_000));
    const r = await importLot({ emails: [mail(1, { message: "Autre texte" })] }, NOW);
    expect(r.misAJour).toBe(0);
    expect(r.ignores[0]!.raison).toBe("déjà envoyé");
    expect((await db.prospectEmail.findUniqueOrThrow({ where: { externalId: "t-1" } })).body).toBe("Bonjour 1");
  });

  it("limite réglable : sans montée en charge, la boîte envoie son maximum dès le premier jour", async () => {
    const { b } = await boites(); // ajoutée aujourd'hui, plafond 2
    expect(rampCap(NOW, 40, NOW, false)).toBe(40);
    expect(rampSchedule(NOW, 40, NOW, false).map((st) => st.perDay)).toEqual([40]);
    await setMailboxLimit(b.id, 30, false);
    expect((await availability(NOW)).rows.find((r) => r.box.id === b.id)!.cap).toBe(30);
    await setMailboxLimit(b.id, 30, true);
    expect((await availability(NOW)).rows.find((r) => r.box.id === b.id)!.cap).toBe(15);
    await expect(setMailboxLimit(b.id, 0, true)).rejects.toMatchObject({ code: "PROSPECTION_LIMIT_INVALID" });
  });

  it("suivi : historique de chaque changement, première réponse datée, relances, chiffres et export", async () => {
    await boites();
    await importLot({ emails: [1, 2, 3].map((i) => mail(i)) }, NOW);
    await vider(new Date(NOW.getTime() + 3 * 3_600_000));
    const p1 = await db.prospect.findUniqueOrThrow({ where: { email: "comite1@cercle1.be" } });
    const demain = iso(new Date(NOW.getTime() + DAY));
    await updateProspect(p1.id, { status: "INTERESSE", notes: "Gala en mars, 400 places", nextActionAt: iso(NOW) }, NOW);
    await updateProspect(p1.id, { status: "INTERESSE", notes: "Gala en mars, 400 places", nextActionAt: iso(NOW) }, NOW); // rien ne change : rien n'est inscrit
    const apres = await db.prospect.findUniqueOrThrow({ where: { id: p1.id }, include: { activities: true } });
    expect(apres.activities.map((a) => a.label).sort()).toEqual(
      [
        "Note modifiée",
        `Relance prévue le ${new Intl.DateTimeFormat("fr-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long", year: "numeric" }).format(apres.nextActionAt!)}`,
        "Statut : Contacté, en attente de réponse → Intéressé",
      ].sort(),
    );
    expect(apres.respondedAt).not.toBeNull();
    const p2 = await db.prospect.findUniqueOrThrow({ where: { email: "comite2@cercle2.be" } });
    await updateProspect(p2.id, { status: "PAS_INTERESSE", nextActionAt: demain }, NOW);
    expect((await listProspects(undefined, undefined, true, new Date(NOW.getTime() + 3_600_000))).map((p) => p.id)).toEqual([p1.id]);
    expect((await listProspects("400 places")).map((p) => p.id)).toEqual([p1.id]);
    const s = await pipelineStats(new Date(NOW.getTime() + 3_600_000));
    expect(s).toMatchObject({ contactes: 3, reponses: 2, tauxReponse: 67, interesses: 1, pasInteresses: 1, aRelancer: 1 });
    const csv = await prospectsCsv();
    expect(csv.split("\r\n")[0]).toContain('"Organisation";"E-mail";"Statut"');
    expect(csv).toContain('"Intéressé"');
    expect((await importLot({ emails: [mail(1, { id: "t-1-nouveau" })] }, NOW)).ignores[0]!.raison).toBe("organisation déjà en discussion");
  });
});
