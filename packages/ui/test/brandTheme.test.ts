import { describe, expect, it } from "vitest";
import {
  BRAND_FONTS,
  BRAND_PRESETS,
  brandCssVars,
  brandWarnings,
  readableAgainst,
  surfacesFor,
} from "../src/brandTheme";
import { contrastRatio } from "../src/tokens";

describe("thème de la billetterie", () => {
  it("sans réglage : rien ne change (charte d'Evoly)", () => {
    expect(brandCssVars({})).toEqual({});
  });

  it("arrondi : un seul réglage pour les cartes et les boutons ; valeur inconnue ignorée", () => {
    expect(brandCssVars({ radius: "square" })).toMatchObject({
      "--r-lg": "0px",
      "--control-radius": "0px",
    });
    expect(brandCssVars({ radius: "extra" })).toMatchObject({
      "--r-lg": "28px",
      "--control-radius": "999px",
    });
    expect(brandCssVars({ radius: "n-importe" })).toEqual({});
  });

  it("polices : titres et texte séparés ; une police d'affiche n'est jamais celle du texte", () => {
    expect(
      brandCssVars({ headingFont: "playfair-display", bodyFont: "lora" }),
    ).toMatchObject({
      "--type-display": BRAND_FONTS["playfair-display"].family,
      "--type-body": BRAND_FONTS.lora.family,
    });
    expect(brandCssVars({ bodyFont: "bebas-neue" })).not.toHaveProperty(
      "--type-body",
    );
    expect(brandCssVars({ headingFont: "comic-sans" })).toEqual({});
  });

  it("fond : surfaces et textes déduits, texte toujours lisible ; fond foncé : mode sombre", () => {
    for (const bg of ["#FFFFFF", "#FAF7F2", "#1A1033", "#3E5C3A", "#FFB8E8"]) {
      const s = surfacesFor(bg);
      expect(contrastRatio(s["--ink"], bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(s["--ink-muted"], bg)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(s["--surface-inverse"], s["--ink-inverse"]),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(surfacesFor("#1A1033")["color-scheme"]).toBe("dark");
    expect(surfacesFor("#FAF7F2")["color-scheme"]).toBe("light");
  });

  it("boutons : couleur d'accent, texte posé dessus choisi pour rester lisible", () => {
    expect(brandCssVars({ accentColor: "#FFD23F" })).toMatchObject({
      "--btn-primary-bg": "#FFD23F",
      "--btn-primary-ink": "#222222",
    });
  });

  it("lisibilité : bouton peu visible sur le fond signalé, avec une teinte proche qui fonctionne", () => {
    const w = brandWarnings({
      accentColor: "#F5EFE6",
      backgroundColor: "#FAF7F2",
    });
    expect(w.map((x) => x.key)).toContain("accentOnBackground");
    const fix = w.find((x) => x.key === "accentOnBackground")!.suggestion;
    expect(contrastRatio(fix, "#FAF7F2")).toBeGreaterThanOrEqual(3);
    expect(
      brandWarnings({ accentColor: "#222222", backgroundColor: "#FFFFFF" }),
    ).toEqual([]);
    expect(
      contrastRatio(readableAgainst("#FFB8E8", "#FFFFFF", 3), "#FFFFFF"),
    ).toBeGreaterThanOrEqual(3);
  });

  it("styles prêts à l'emploi : polices connues, couleurs valables, aucune alerte de lisibilité", () => {
    for (const p of BRAND_PRESETS) {
      for (const f of [p.headingFont, p.bodyFont])
        if (f) expect(f in BRAND_FONTS, `${p.key} : ${f}`).toBe(true);
      expect(brandWarnings(p), p.key).toEqual([]);
    }
  });
});
