import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Règle typographique d'Evoly : uniquement des tirets normaux (-), jamais de tiret long (U+2014) ni moyen (U+2013),
// dans tout le dépôt : textes de l'app et du site dans toutes les langues, titres, e-mails, PDF, documents, code et tests.
// Seules exceptions : l'archive figée legacy/ et les migrations déjà appliquées (leur empreinte ne doit pas changer).
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BINARY = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|pdf|zip|gz|pkpass|mp4|webm)$/i;

describe("typographie", () => {
  it("aucun tiret long ni moyen : uniquement des tirets normaux", () => {
    const files = execSync("git ls-files", { cwd: ROOT, encoding: "utf-8" }).split("\n").filter((p) => p && !p.startsWith("legacy/") && !p.includes("/prisma/migrations/") && !BINARY.test(p));
    const found = files.filter((p) => {
      try { return /[\u2013\u2014]/.test(readFileSync(`${ROOT}/${p}`, "utf-8")); } catch { return false; }
    });
    expect(found, "remplacer par un tiret normal (-)").toEqual([]);
  });
});
