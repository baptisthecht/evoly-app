import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, inkOn, palette } from "../src";

describe("contrastes (RG-BRD-01, WCAG AA)", () => {
  it("texte charbon sur les fonds clairs de la charte", () => {
    for (const bg of [palette.creme, palette.lilas, palette.rose, palette.bulle]) expect(contrastRatio(palette.charbon, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("crème sur charbon et graphite", () => {
    expect(contrastRatio(palette.creme, palette.charbon)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.creme, palette.graphite)).toBeGreaterThanOrEqual(4.5);
  });
  it("couleurs fonctionnelles lisibles sur blanc et sur crème", () => {
    for (const c of [palette.success, palette.warning, palette.danger, palette.info]) {
      expect(contrastRatio(c, palette.blanc)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c, palette.creme)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("choix automatique de l'encre sur une couleur de marque", () => {
    expect(inkOn("#FFB8E8")).toBe("#222222");
    expect(inkOn("#3D5AFE")).toBe("#FFFFFF");
    expect(inkOn("#FFD23F")).toBe("#222222");
    expect(inkOn("#0B7A50")).toBe("#FFFFFF");
  });
});

describe("feuilles de style", () => {
  const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  it("mode sombre système et forcé définissent les mêmes variables", () => {
    const block = (re: RegExp) => [...(tokens.match(re)?.[1] ?? "").matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]).sort();
    const system = block(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/);
    const forced = block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
    expect(system.length).toBeGreaterThan(10);
    expect(forced).toEqual(system);
  });
});
