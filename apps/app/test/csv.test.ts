import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { csvSafe } from "@/lib/csv";
import { contactsCsv } from "@/server/contacts";
import type { OrgContext } from "@/server/context";

describe("cellules CSV sans formule exécutable (injection CSV, OWASP)", () => {
  it("une cellule qui commence par = + - @, une tabulation ou un retour chariot est lue comme du texte", () => {
    for (const v of [
      '=HYPERLINK("https://piege.example";"Cliquez")',
      "+SUM(A1:A9)",
      "-2+3",
      "@SUM(A1)",
      "\t=1",
      "\r=1",
    ])
      expect(csvSafe(v)).toBe(`'${v}`);
  });
  it("les nombres et les montants restent des nombres, le texte ordinaire est inchangé", () => {
    expect([
      csvSafe(12),
      csvSafe(-3),
      csvSafe("-12,50"),
      csvSafe("+4.5"),
      csvSafe("12,50"),
      csvSafe("Léa"),
      csvSafe("2026-10-18"),
      csvSafe(null),
      csvSafe(undefined),
    ]).toEqual([
      "12",
      "-3",
      "-12,50",
      "+4.5",
      "12,50",
      "Léa",
      "2026-10-18",
      "",
      "",
    ]);
  });
  it("un numéro de téléphone international est gardé, comme du texte", () => {
    expect(csvSafe("+32 470 12 34 56")).toBe("'+32 470 12 34 56");
  });
});

describe("export des contacts : un nom piégé saisi à la caisse ne devient jamais une formule", () => {
  it("le prénom piégé est neutralisé dans le fichier", async () => {
    const id = Math.random().toString(36).slice(2, 10);
    const org = await db.organization.create({
      data: {
        name: "Club",
        slug: `club-${id}`,
        subdomain: `club-${id}`,
        country: "BE",
        currency: "EUR",
      },
    });
    await db.contact.create({
      data: {
        organizationId: org.id,
        email: `piege.${id}@exemple.be`,
        firstName: '=HYPERLINK("https://piege.example";"Cliquez")',
        lastName: "@SUM(A1)",
      },
    });
    const csv = await contactsCsv({
      organization: { id: org.id },
    } as unknown as OrgContext);
    const row = csv.split("\r\n").find((l) => l.includes(`piege.${id}`))!;
    const cells = row.split(";");
    expect(cells.every((c) => !/^"?[=+@]/.test(c))).toBe(true);
    expect(row).toContain("'=HYPERLINK");
    expect(row).toContain("'@SUM(A1)");
  });
});

describe("garde : toute fabrique de CSV passe par csvSafe", () => {
  it("aucun fichier du serveur ne fabrique de cellule CSV sans neutraliser les formules", () => {
    const root = path.resolve(__dirname, "../src");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(root);
    const makers = files.filter((p) =>
      /replace\(\/"\/g, '""'\)/.test(readFileSync(p, "utf8")),
    );
    expect(makers.length).toBeGreaterThanOrEqual(8);
    expect(
      makers
        .filter((p) => !readFileSync(p, "utf8").includes("csvSafe("))
        .map((p) => path.relative(root, p)),
    ).toEqual([]);
  });
});
