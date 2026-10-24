import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { detectColumns, readCsv, readTable } from "@/server/importFile";

// lecture des fichiers de billets des réseaux (docs/COMPATIBILITE_RESEAUX.md) : CSV, Excel, colonnes reconnues
const refused = (code: string) => expect.objectContaining({ code });
const utf8 = (s: string) => new TextEncoder().encode(s);
/** Classeur Excel minimal, comme ceux qu'exportent les réseaux. */
function xlsx(sheetRows: string, shared: string[]) {
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "xl/workbook.xml": strToU8(
      '<workbook xmlns:r="r"><sheets><sheet name="Billets" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/sharedStrings.xml": strToU8(
      `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  });
}

describe("fichiers CSV", () => {
  it("point-virgule et marque d'ordre ; lignes vides retirées ; espaces insécables nettoyés", () => {
    expect(
      readTable(
        utf8("\ufeffCode-barres;Nom\n\n4006381333931;Léa\u00a0Martin\n"),
        "billets.csv",
      ),
    ).toEqual([
      ["Code-barres", "Nom"],
      ["4006381333931", "Léa Martin"],
    ]);
  });

  it("virgule, guillemets doublés et retour à la ligne dans une cellule ; tabulation", () => {
    expect(readCsv('code,nom\n"TM-1","Dubois, ""Tom""\nfils"\n')).toEqual([
      ["code", "nom"],
      ["TM-1", 'Dubois, "Tom"\nfils'],
    ]);
    expect(readTable(utf8("code\tnom\nTM-2\tInès\n"), "export.txt")).toEqual([
      ["code", "nom"],
      ["TM-2", "Inès"],
    ]);
  });

  it("codage Windows d'un CSV enregistré par Excel en français : accents retrouvés", () => {
    const bytes = new Uint8Array([
      ...utf8("Nom;Pr"),
      0xe9,
      ...utf8("nom\nDurand;H"),
      0xe9,
      ...utf8("l"),
      0xe8,
      ...utf8("ne\n"),
    ]);
    expect(readTable(bytes, "liste.csv")).toEqual([
      ["Nom", "Prénom"],
      ["Durand", "Hélène"],
    ]);
  });
});

describe("fichiers Excel", () => {
  it("première feuille : textes partagés, texte en ligne, code-barres saisi comme nombre", () => {
    const rows =
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2"><v>4.006381333931E+12</v></c><c r="B2" t="inlineStr"><is><t>Léa &amp; Tom</t></is></c></row>' +
      '<row r="3"><c r="B3" t="s"><v>2</v></c></row>';
    expect(
      readTable(
        xlsx(rows, ["Code-barres", "Nom", "Inès"]),
        "ticketmaster.xlsx",
      ),
    ).toEqual([
      ["Code-barres", "Nom"],
      ["4006381333931", "Léa & Tom"],
      ["", "Inès"],
    ]);
  });

  it("archive piégée, ancien fichier .xls, fichier vide ou trop gros : refusés avec une raison", () => {
    const bomb = zipSync(
      { "xl/worksheets/sheet1.xml": new Uint8Array(61 * 1024 * 1024) },
      { level: 9 },
    );
    expect(() => readTable(bomb, "piege.xlsx")).toThrow(
      refused("IMPORT_FILE_TOO_LARGE"),
    );
    expect(() =>
      readTable(
        new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        "ancien.xls",
      ),
    ).toThrow(refused("IMPORT_FILE_OLD_EXCEL"));
    expect(() => readTable(new Uint8Array(), "vide.csv")).toThrow(
      refused("IMPORT_FILE_EMPTY"),
    );
    expect(() =>
      readTable(new Uint8Array(5 * 1024 * 1024 + 1), "gros.csv"),
    ).toThrow(refused("IMPORT_FILE_TOO_LARGE"));
    expect(() =>
      readTable(zipSync({ "autre.txt": strToU8("x") }), "faux.xlsx"),
    ).toThrow(refused("IMPORT_FILE_UNREADABLE"));
  });
});

describe("reconnaissance des colonnes", () => {
  it("en-têtes français, avec accents et ponctuation : toutes les colonnes retrouvées", () => {
    const head = [
      "N° de billet",
      "Prénom",
      "Nom",
      "Tarif",
      "Prix TTC",
      "Rang",
      "Place",
    ];
    expect(
      detectColumns([
        head,
        ["4006381333931", "Léa", "Martin", "Plein", "25,00", "C", "12"],
      ]),
    ).toEqual({
      header: true,
      sure: true,
      map: {
        code: 0,
        firstName: 1,
        lastName: 2,
        tarif: 3,
        price: 4,
        row: 5,
        seat: 6,
      },
    });
  });

  it("en-têtes anglais ; liste de réservations à la BilletReduc, sans code-barres : importable", () => {
    expect(
      detectColumns([
        ["Barcode", "Full name", "Ticket type"],
        ["TM8812345", "Tom Dubois", "Adult"],
      ]).map,
    ).toEqual({ code: 0, fullName: 1, tarif: 2 });
    expect(
      detectColumns([
        ["N° réservation", "Nom", "Nb places"],
        ["BR-77812", "Durand", "2"],
      ]),
    ).toEqual({
      header: true,
      sure: true,
      map: { reservation: 0, lastName: 1, quantity: 2 },
    });
  });

  it("sans en-tête : la colonne qui ressemble à des codes-barres ; fichier ambigu : à confirmer", () => {
    expect(
      detectColumns([
        ["Léa Martin", "4006381333931"],
        ["Tom Dubois", "4006381333948"],
      ]),
    ).toEqual({ header: false, sure: true, map: { code: 1 } });
    expect(
      detectColumns([
        ["Nom", "Tarif"],
        ["Durand", "Plein"],
      ]).sure,
    ).toBe(false);
  });
});

describe("fichiers sans rapport avec des billets (essai réel : résultats du Loto)", () => {
  const loto = [
    [
      "annee_numero_de_tirage",
      "jour_de_tirage",
      "date_de_tirage",
      "boule_1",
      "numero_chance",
      "combinaison_gagnante_en_ordre_croissant",
      "codes_gagnants",
    ],
    [
      "25070",
      "MERCREDI",
      "11/06/2025",
      "9",
      "6",
      "7-9-15-18-19+6",
      "O 4122 5280, C 9415 0507",
    ],
    [
      "25069",
      "LUNDI",
      "09/06/2025",
      "25",
      "10",
      "5-12-25-34-38+10",
      "D 2061 8398, D 2239 7569",
    ],
    [
      "25068",
      "SAMEDI",
      "07/06/2025",
      "7",
      "1",
      "7-30-37-40-45+1",
      "K 7124 8386, D 8310 2578",
    ],
  ];

  it("titres inconnus : ligne de titres reconnue, aucune colonne devinée, jamais « sûr »", () => {
    expect(detectColumns(loto)).toEqual({ header: true, map: {}, sure: false });
  });

  it("sans titres, des combinaisons « 7-9-15-18-19+6 » ne sont pas des codes-barres", () => {
    expect(detectColumns(loto.slice(1)).map.code).not.toBe(5);
    expect(detectColumns(loto.slice(1)).sure).toBe(false);
  });

  it("e-mail, téléphone et consentement reconnus par leurs titres", () => {
    expect(
      detectColumns([
        ["Code-barres", "E-mail", "Téléphone", "Opt-in"],
        ["4006381333931", "lea@exemple.fr", "0612345678", "oui"],
      ]).map,
    ).toEqual({ code: 0, email: 1, phone: 2, consent: 3 });
  });
});
