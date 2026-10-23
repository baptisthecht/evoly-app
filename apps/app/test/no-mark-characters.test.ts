import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Règle typographique d'Evoly : jamais de caractères de coche ou de croix (✓ ✔ ✗ ✘ ✕ ✖) dans le dépôt ; une vraie
// icône (components/ui/icons : CheckIcon, CrossIcon, AlertIcon) ou un mot à la place. Mêmes exceptions que les tirets.
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BINARY =
  /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|pdf|zip|gz|pkpass|mp4|webm)$/i;
const MARKS = /[\u2713\u2714\u2715\u2716\u2717\u2718]/;

describe("typographie", () => {
  it("aucun caractère de coche ou de croix : une vraie icône à la place", () => {
    const files = execSync("git ls-files", { cwd: ROOT, encoding: "utf-8" })
      .split("\n")
      .filter(
        (p) =>
          p &&
          !p.startsWith("legacy/") &&
          !p.includes("/prisma/migrations/") &&
          !BINARY.test(p) &&
          !p.endsWith("no-mark-characters.test.ts"),
      );
    const found = files.filter((p) => {
      try {
        return MARKS.test(readFileSync(`${ROOT}/${p}`, "utf-8"));
      } catch {
        return false;
      }
    });
    expect(
      found,
      "remplacer par une icône (CheckIcon, CrossIcon, AlertIcon) ou par un mot",
    ).toEqual([]);
  });
});
