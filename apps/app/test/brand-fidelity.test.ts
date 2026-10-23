import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BRAND_FONTS, brandCssVars } from "@evoly/ui";
import { describe, expect, it } from "vitest";

// fidélité de la personnalisation (RG-BRD-01) : polices du thème, et chaque police proposée réellement hébergée par Evoly
// polices de la charte (fonts.css) et polices proposées aux organisateurs (brand-fonts.css)
const css = ["fonts.css", "brand-fonts.css"]
  .map((f) =>
    readFileSync(
      new URL(`../../../packages/ui/src/styles/${f}`, import.meta.url),
      "utf8",
    ),
  )
  .join("\n");
const require = createRequire(
  new URL("../../../packages/ui/package.json", import.meta.url),
);

describe("thème de l'organisateur : polices", () => {
  it("police du texte : appliquée au texte ET aux libellés ; police des titres : aux titres", () => {
    const vars = brandCssVars({
      headingFont: "playfair-display",
      bodyFont: "space-grotesk",
    });
    expect(vars["--type-display"]).toBe(BRAND_FONTS["playfair-display"].family);
    expect(vars["--type-body"]).toBe(BRAND_FONTS["space-grotesk"].family);
    expect(vars["--type-label"]).toBe(BRAND_FONTS["space-grotesk"].family);
  });

  it("une police réservée aux titres n'est jamais utilisée pour le texte ; sans choix, aucune police imposée", () => {
    expect(
      brandCssVars({ bodyFont: "bebas-neue" })["--type-body"],
    ).toBeUndefined();
    const none = brandCssVars({});
    expect([
      none["--type-display"],
      none["--type-body"],
      none["--type-label"],
    ]).toEqual([undefined, undefined, undefined]);
  });

  it("chacune des polices proposées est hébergée par Evoly (fichiers présents), jamais chargée chez Google", () => {
    for (const [key, font] of Object.entries(BRAND_FONTS)) {
      const slug = font.label.toLowerCase().replace(/\s+/g, "-");
      expect(css, `${key} : importée`).toContain(`@fontsource/${slug}/`);
      const pkg = require.resolve(`@fontsource/${slug}/package.json`);
      expect(existsSync(pkg), `${key} : paquet installé`).toBe(true);
    }
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
});
