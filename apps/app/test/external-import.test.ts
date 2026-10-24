import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { createDistributor, setAllocation } from "@/server/distributors";
import { createEvent } from "@/server/events";
import { ticketsCsv } from "@/server/finances";
import {
  deleteImportBatch,
  searchExternalTickets,
  importExternalTickets,
  listImportBatches,
  MARKETING_ATTESTATION,
  previewImport,
} from "@/server/externalImport";
import {
  detectColumns,
  IMPORT_FIELDS,
  type ImportField,
  readRows,
} from "@/server/importFile";
import { applySeatingTemplate, setSeatingMode } from "@/server/seating";

// import des billets d'un réseau (docs/COMPATIBILITE_RESEAUX.md) : colonnes toujours confirmées, vagues d'import
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Spectacle",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-17T23:00",
  timezone: "Europe/Paris",
  locationType: "PHYSICAL" as const,
  locationName: "Cabaret",
  city: "Paris",
  country: "FR",
};
async function setup(o: { pro?: boolean } = {}) {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille Dupont",
      email: `own.${id}@exemple.fr`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Cabaret ${id}`,
      slug: `cab-${id}`,
      subdomain: `cab-${id}`,
      country: "FR",
      currency: "EUR",
      timezone: "Europe/Paris",
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
  const event = await createEvent(ctx, essentials, {
    name: "Plein tarif",
    price: "0",
    quantity: 100,
  });
  const tm =
    o.pro === false
      ? null
      : await createDistributor(ctx, { kind: "TICKETMASTER" });
  return { ctx, eventId: event.id, tm, id, owner };
}
const csv = (text: string, name = "ticketmaster.csv") => ({
  name,
  bytes: new TextEncoder().encode(text),
});
/** Ce que fera l'écran : la proposition des colonnes, chaque champ restant marqué « absent de ce fichier ». */
function confirmed(
  text: string,
  over: Partial<Record<ImportField, number | null>> = {},
) {
  const { rows } = readRows(new TextEncoder().encode(text), "f.csv");
  const d = detectColumns(rows);
  const mapping = Object.fromEntries(
    IMPORT_FIELDS.map((f) => [f, d.map[f] ?? null]),
  ) as Record<ImportField, number | null>;
  return { mapping: { ...mapping, ...over }, header: d.header };
}
const tickets = (eventId: string) =>
  db.externalTicket.findMany({
    where: { eventId },
    orderBy: [{ code: "asc" }, { reservation: "asc" }, { rank: "asc" }],
  });

describe("import des billets d'un réseau : colonnes confirmées", () => {
  it("import, réimport identique sans changement, nom modifié mis à jour ; fichier complet : disparu annulé, déjà entré gardé", async () => {
    const { ctx, eventId, tm } = await setup();
    const file =
      "Code-barres;Nom;Tarif;Prix TTC\n4006381333931;Léa Martin;Plein tarif;25,00 €\n4006381333948;Tom Dubois;Plein tarif;25,00\n4006381333955;Inès Benali;Plein tarif;25\n";
    expect(
      await importExternalTickets(
        ctx,
        eventId,
        tm!.id,
        csv(file),
        confirmed(file),
      ),
    ).toMatchObject({ created: 3, updated: 0, ignored: [] });
    const first = await tickets(eventId);
    expect(
      first.map((t) => [t.code, t.holderName, t.priceMinor, t.status]),
    ).toEqual([
      ["4006381333931", "Léa Martin", 2500, "VALID"],
      ["4006381333948", "Tom Dubois", 2500, "VALID"],
      ["4006381333955", "Inès Benali", 2500, "VALID"],
    ]);
    expect(
      await importExternalTickets(
        ctx,
        eventId,
        tm!.id,
        csv(file),
        confirmed(file),
      ),
    ).toMatchObject({ created: 0, unchanged: 3 });
    const renamed = file.replace("Tom Dubois", "Thomas Dubois");
    expect(
      await importExternalTickets(
        ctx,
        eventId,
        tm!.id,
        csv(renamed),
        confirmed(renamed),
      ),
    ).toMatchObject({ updated: 1, unchanged: 2 });
    await db.externalTicket.update({
      where: { id: first[2]!.id },
      data: { checkedInAt: new Date() },
    });
    const shorter = "Code-barres;Nom\n4006381333931;Léa Martin\n";
    expect(
      await importExternalTickets(ctx, eventId, tm!.id, csv(shorter), {
        ...confirmed(shorter),
        fullFile: true,
      }),
    ).toMatchObject({ cancelled: 1, keptEntered: 1 });
    expect((await tickets(eventId)).map((t) => t.status)).toEqual([
      "VALID",
      "CANCELLED",
      "VALID",
    ]);
  });

  it("colonnes non confirmées, ou ni code ni réservation : refusé, rien n'est importé", async () => {
    const { ctx, eventId, tm } = await setup();
    const file =
      "annee_numero_de_tirage;combinaison_gagnante\n25070;7-9-15-18-19+6\n";
    await expect(
      importExternalTickets(ctx, eventId, tm!.id, csv(file), {
        mapping: {},
        header: true,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_MAPPING_INCOMPLETE" });
    await expect(
      importExternalTickets(ctx, eventId, tm!.id, csv(file), confirmed(file)),
    ).rejects.toMatchObject({ code: "IMPORT_MAPPING_NO_KEY" });
    await expect(
      importExternalTickets(
        ctx,
        eventId,
        tm!.id,
        csv(file),
        confirmed(file, { code: 9 }),
      ),
    ).rejects.toMatchObject({ code: "IMPORT_MAPPING_INVALID" });
    expect(await db.externalTicket.count({ where: { eventId } })).toBe(0);
    expect(await db.importBatch.count({ where: { eventId } })).toBe(0);
  });

  it("chaque import : une vague, avec ses colonnes et son compte rendu ; un réimport ne change pas la vague d'un billet", async () => {
    const { ctx, eventId, tm, owner } = await setup();
    const a = "Code-barres;Nom\nTM-1;Léa\n";
    const b = "Code-barres;Nom\nTM-1;Léa Martin\nTM-2;Tom\n";
    const first = await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv(a, "lundi.csv"),
      confirmed(a),
    );
    const second = await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv(b, "mardi.csv"),
      confirmed(b),
    );
    const batches = await db.importBatch.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });
    expect(
      batches.map((x) => [
        x.fileName,
        x.createdById,
        (x.report as { created: number }).created,
      ]),
    ).toEqual([
      ["lundi.csv", owner.id, 1],
      ["mardi.csv", owner.id, 1],
    ]);
    expect((batches[0]!.mapping as Record<string, unknown>).email).toBeNull(); // « absent de ce fichier », enregistré
    const byCode = Object.fromEntries(
      (await tickets(eventId)).map((t) => [t.code, t.importBatchId]),
    );
    expect(byCode).toEqual({ "TM-1": first.batchId, "TM-2": second.batchId });
  });

  it("e-mail, téléphone, consentement lus ; e-mail invalide écarté ; réservations BilletReduc : un billet par place", async () => {
    const { ctx, eventId, id } = await setup();
    const br = await createDistributor(ctx, { kind: "BILLETREDUC" });
    const file =
      "N° réservation;Nom;Nb places;E-mail;Téléphone;Opt-in\nBR-1;Durand;2;Lea.Durand@Exemple.fr;0612345678;oui\nBR-2;Lefèvre;1;pas-un-email;;non\nBR-1;Durand;2;;;\n;;;;;\n;Sans réservation;1;;;\n";
    const report = await importExternalTickets(
      ctx,
      eventId,
      br.id,
      csv(file, `billetreduc-${id}.csv`),
      confirmed(file),
    );
    expect(report).toMatchObject({
      created: 3,
      ignored: [
        { line: 4, reason: "DUPLICATE_IN_FILE" },
        { line: 6, reason: "LINE_NO_CODE" },
      ],
    });
    expect(
      (await tickets(eventId)).map((t) => [
        t.reservation,
        t.rank,
        t.holderName,
        t.holderEmail,
        t.holderPhone,
        t.marketingConsent,
      ]),
    ).toEqual([
      ["BR-1", 1, "Durand", "lea.durand@exemple.fr", "0612345678", true],
      ["BR-1", 2, "Durand", "lea.durand@exemple.fr", "0612345678", true],
      ["BR-2", 1, "Lefèvre", null, null, false],
    ]);
  });

  it("marketing : refusé sans consentement ; avec la colonne du fichier ; ou avec l'attestation sur l'honneur, enregistrée", async () => {
    const { ctx, eventId, tm } = await setup();
    const noConsent = "Code-barres;Nom;E-mail\nTM-1;Léa;lea@exemple.fr\n";
    await expect(
      importExternalTickets(ctx, eventId, tm!.id, csv(noConsent), {
        ...confirmed(noConsent),
        marketing: true,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_MARKETING_CONSENT_REQUIRED" });
    const withColumn =
      "Code-barres;Nom;E-mail;Opt-in\nTM-2;Tom;tom@exemple.fr;oui\n";
    const col = await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv(withColumn),
      { ...confirmed(withColumn), marketing: true },
    );
    const attested = await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv(noConsent),
      { ...confirmed(noConsent), marketing: true, attestation: true },
    );
    const [b1, b2] = await Promise.all([
      db.importBatch.findUniqueOrThrow({ where: { id: col.batchId } }),
      db.importBatch.findUniqueOrThrow({ where: { id: attested.batchId } }),
    ]);
    expect([
      b1.marketing,
      b1.consentSource,
      b1.attestedAt,
      b1.attestationText,
    ]).toEqual([true, "COLUMN", null, null]);
    expect([
      b2.marketing,
      b2.consentSource,
      b2.attestedAt instanceof Date,
      b2.attestationText,
    ]).toEqual([true, "ATTESTATION", true, MARKETING_ATTESTATION]);
  });

  it("code déjà utilisé par un autre réseau : ignoré ; dépassement de contingent : signalé sans bloquer ; Pro exigé", async () => {
    const { ctx, eventId, tm } = await setup();
    const fnac = await createDistributor(ctx, { kind: "FRANCE_BILLET" });
    const ticketTypeId = (
      await db.ticketType.findFirstOrThrow({ where: { eventId } })
    ).id;
    await setAllocation(ctx, eventId, {
      distributorId: tm!.id,
      ticketTypeId,
      quantity: 1,
    });
    const one = "Code-barres\n9990001112223\n";
    await importExternalTickets(
      ctx,
      eventId,
      fnac.id,
      csv(one),
      confirmed(one),
    );
    const three = "Code-barres\n9990001112223\n4006381333931\n4006381333948\n";
    expect(
      await importExternalTickets(
        ctx,
        eventId,
        tm!.id,
        csv(three),
        confirmed(three),
      ),
    ).toMatchObject({
      created: 2,
      ignored: [{ line: 2, reason: "CODE_USED_BY_OTHER_NETWORK" }],
      overAllocation: [
        { ticketType: "Plein tarif", allocated: 1, imported: 2 },
      ],
    });
    const free = await setup({ pro: false });
    await expect(
      importExternalTickets(
        free.ctx,
        free.eventId,
        "x",
        csv(one),
        confirmed(one),
      ),
    ).rejects.toMatchObject({ code: "PRO_REQUIRED" });
  });

  it("places numérotées : place reliée et retirée de la vente en ligne ; déjà vendue par Evoly : double vente signalée ; inconnue : comptée", async () => {
    const { ctx, eventId, tm } = await setup();
    await applySeatingTemplate(ctx, eventId, "hall", {
      rows: 1,
      seatsFirst: 4,
      seatsLast: 4,
      centerAisle: false,
      categories: 1,
    });
    await setSeatingMode(ctx, eventId, true);
    const seats = await db.seat.findMany({
      where: { row: { seatingMap: { eventId } } },
      orderBy: { sortOrder: "asc" },
      include: { row: { select: { name: true } } },
    });
    const [a1, a2] = seats;
    await db.seat.update({ where: { id: a2!.id }, data: { status: "SOLD" } });
    const file = `Code-barres;Rang;Place\nTM-1;${a1!.row.name};${a1!.label}\nTM-2;${a2!.row.name};${a2!.label}\nTM-3;Z;99\n`;
    expect(
      await importExternalTickets(
        ctx,
        eventId,
        tm!.id,
        csv(file),
        confirmed(file),
      ),
    ).toMatchObject({
      created: 3,
      seatsNotFound: 1,
      seatsSoldOnEvoly: [{ line: 3, seat: `${a2!.row.name} ${a2!.label}` }],
    });
    expect(
      (
        await db.externalTicket.findFirstOrThrow({
          where: { eventId, code: "TM-1" },
        })
      ).seatId,
    ).toBe(a1!.id);
    expect(
      await db.seat.findUniqueOrThrow({
        where: { id: a1!.id },
        select: { status: true, distributorId: true },
      }),
    ).toEqual({ status: "BLOCKED", distributorId: tm!.id });
  });
});

describe("aperçu, historique et suppression des vagues d'import", () => {
  it("aperçu du fichier du Loto : titres reconnus, aucune colonne proposée, alertes ; rien n'est importé", async () => {
    const { ctx, eventId, tm } = await setup();
    const loto =
      "annee_numero_de_tirage;jour_de_tirage;combinaison_gagnante_en_ordre_croissant\n25070;MERCREDI;7-9-15-18-19+6\n25069;LUNDI;5-12-25-34-38+10\n";
    const p = await previewImport(ctx, eventId, tm!.id, csv(loto, "loto.csv"));
    expect(p).toMatchObject({
      header: true,
      rowCount: 2,
      proposal: {},
      remembered: false,
      warnings: ["NO_KEY", "NO_NAME", "UNKNOWN_HEADER"],
    });
    expect(p.columns).toEqual([
      "annee_numero_de_tirage",
      "jour_de_tirage",
      "combinaison_gagnante_en_ordre_croissant",
    ]);
    expect(await db.externalTicket.count({ where: { eventId } })).toBe(0);
  });

  it("fichier suivant de même forme : le choix mémorisé pour ce réseau est reproposé, champs absents compris", async () => {
    const { ctx, eventId, tm } = await setup();
    const a = "Ref;Client;Divers\nX-9001;Léa;abc\n";
    await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv(a),
      confirmed(a, { code: 0, fullName: 1 }),
    );
    const b = "Ref;Client;Divers\nX-9002;Tom;def\n";
    const p = await previewImport(ctx, eventId, tm!.id, csv(b));
    expect(p.remembered).toBe(true);
    expect(p.proposal).toMatchObject({
      code: 0,
      fullName: 1,
      email: null,
      phone: null,
      consent: null,
    });
    expect(p.warnings).toEqual([]);
  });

  it("suppression d'une vague : billets non entrés retirés, entré gardé, autre vague intacte ; pas deux fois ; historique", async () => {
    const { ctx, eventId, tm } = await setup();
    const a = "Code-barres;Nom\nA-1;Léa\nA-2;Tom\nA-3;Inès\n";
    const b = "Code-barres;Nom\nB-1;Nina\n";
    const first = await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv(a, "lundi.csv"),
      confirmed(a),
    );
    await importExternalTickets(
      ctx,
      eventId,
      tm!.id,
      csv(b, "mardi.csv"),
      confirmed(b),
    );
    await db.externalTicket.updateMany({
      where: { eventId, code: "A-3" },
      data: { checkedInAt: new Date() },
    });
    expect(await deleteImportBatch(ctx, eventId, first.batchId)).toEqual({
      deleted: 2,
      keptEntered: 1,
    });
    expect((await tickets(eventId)).map((t) => t.code)).toEqual(["A-3", "B-1"]);
    await expect(
      deleteImportBatch(ctx, eventId, first.batchId),
    ).rejects.toMatchObject({ code: "IMPORT_ALREADY_DELETED" });
    const history = await listImportBatches(ctx, eventId);
    expect(
      history.map((h) => [
        h.fileName,
        h.status,
        h.deletedCount,
        h.keptEntered,
        h.distributor,
      ]),
    ).toEqual([
      ["mardi.csv", "IMPORTED", null, null, "Ticketmaster"],
      ["lundi.csv", "DELETED", 2, 1, "Ticketmaster"],
    ]);
  });
});

describe("participants : billets vendus par les réseaux", () => {
  it("par réseau ; recherche dans le nom, l'e-mail, le code et la réservation ; jamais un billet d'une autre organisation", async () => {
    const { ctx, eventId, tm } = await setup();
    const fnac = await createDistributor(ctx, { kind: "FRANCE_BILLET" });
    await db.externalTicket.createMany({
      data: [
        {
          eventId,
          distributorId: tm!.id,
          code: "TM-111",
          holderName: "Léa Martin",
          holderEmail: "lea@exemple.fr",
        },
        {
          eventId,
          distributorId: tm!.id,
          code: "TM-222",
          holderName: "Tom Dubois",
        },
        {
          eventId,
          distributorId: fnac.id,
          reservation: "BR-77812",
          holderName: "Inès Benali",
        },
      ],
    });
    const other = await setup();
    await db.externalTicket.create({
      data: {
        eventId: other.eventId,
        distributorId: other.tm!.id,
        code: "TM-999",
        holderName: "Léa Autre",
      },
    });
    const names = async (o: { distributorId?: string; q?: string }) =>
      (await searchExternalTickets(ctx, { eventId, ...o })).rows.map(
        (r) => r.holderName,
      );
    expect(await names({})).toEqual([
      "Inès Benali",
      "Léa Martin",
      "Tom Dubois",
    ]);
    expect(await names({ distributorId: fnac.id })).toEqual(["Inès Benali"]);
    expect(await names({ q: "LEA@" })).toEqual(["Léa Martin"]);
    expect(await names({ q: "tm-222" })).toEqual(["Tom Dubois"]);
    expect(await names({ q: "77812" })).toEqual(["Inès Benali"]);
    await expect(
      searchExternalTickets(ctx, { eventId: other.eventId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("par pages de 50", async () => {
    const { ctx, eventId, tm } = await setup();
    await db.externalTicket.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        eventId,
        distributorId: tm!.id,
        code: `P-${String(i).padStart(3, "0")}`,
        holderName: `Spectateur ${String(i).padStart(3, "0")}`,
      })),
    });
    const first = await searchExternalTickets(ctx, { eventId });
    const second = await searchExternalTickets(ctx, { eventId, page: 1 });
    expect([
      first.total,
      first.pages,
      first.rows.length,
      second.rows.length,
      second.rows[0]!.holderName,
    ]).toEqual([51, 2, 50, 1, "Spectateur 050"]);
  });
});

describe("export des participants : billets vendus par les réseaux", () => {
  it("colonne « Canal » et billets importés dans l'export de l'événement ; jamais dans l'export financier d'une période", async () => {
    const { ctx, eventId, tm } = await setup();
    await db.externalTicket.create({
      data: {
        eventId,
        distributorId: tm!.id,
        code: "TM-4242",
        reservation: "R-1",
        holderName: "Léa Martin",
        holderEmail: "lea@exemple.fr",
        priceMinor: 2500,
        checkedInAt: new Date("2027-04-17T19:05:00Z"),
      },
    });
    const [head, ...rows] = (await ticketsCsv(ctx, { period: "ALL", eventId }))
      .replace(/^\ufeff/, "")
      .trim()
      .split("\r\n");
    const cols = head!.split(";");
    expect(cols).toContain("Canal");
    const line = rows.find((r) => r.includes("TM-4242"))!.split(";");
    const at = (name: string) => line[cols.indexOf(name)];
    expect([
      at("Référence commande"),
      at("Titulaire"),
      at("E-mail du titulaire"),
      at("Canal"),
      at("Statut"),
    ]).toEqual([
      "R-1",
      "Léa Martin",
      "lea@exemple.fr",
      "Ticketmaster",
      "VALID",
    ]);
    expect(at("Prix payé")).toMatch(/^25[,.]00$/);
    expect(at("Entrée")).toBe("2027-04-17 21:05");
    expect(await ticketsCsv(ctx, { period: "ALL" })).not.toContain("TM-4242");
  });
});
