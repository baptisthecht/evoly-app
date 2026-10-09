import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE } from "@evoly/core";

const ROOT = join(__dirname, "..", "..", "..");
const tokens = readFileSync(join(ROOT, "packages/ui/src/styles/tokens.css"), "utf8");
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Exceptions justifiées : e-mails (les messageries imposent des couleurs en ligne), couleurs proposées pour le contenu
 * des e-mails dans l'éditeur, et images d'aperçu générées.
 */
const ALLOWED = [/\/server\/email\//, /\/components\/email\//, /\/api\/og\//, /opengraph-image/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "node_modules" || f === "generated") return [];
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("design system (RG-UI-02)", () => {
  it("la palette des contextes sans CSS est le miroir exact des jetons du design system", () => {
    for (const [key, value] of Object.entries(PALETTE)) {
      const m = tokens.match(new RegExp(`--evoly-${kebab(key)}:\\s*(#[0-9a-fA-F]{6})`));
      expect(m?.[1]?.toLowerCase(), `jeton --evoly-${kebab(key)}`).toBe(value);
    }
  });

  it("aucune couleur codée en dur dans l'app, hors exceptions justifiées", () => {
    const offenders = files(join(__dirname, "..", "src"))
      .filter((p) => !ALLOWED.some((r) => r.test(p.replace(/\\/g, "/"))))
      .filter((p) => /#[0-9a-fA-F]{6}\b/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(p.indexOf("src")));
    expect(offenders).toEqual([]);
  });
});
