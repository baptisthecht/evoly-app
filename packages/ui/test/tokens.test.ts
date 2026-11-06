import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, inkOn, palette } from "../src";

describe("contrastes (RG-BRD-01, WCAG AA)", () => {
  it("texte charbon sur les fonds clairs de la charte", () => {
    for (const bg of [
      palette.creme,
      palette.lilas,
      palette.rose,
      palette.bulle,
    ])
      expect(contrastRatio(palette.charbon, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("crème sur charbon et graphite", () => {
    expect(
      contrastRatio(palette.creme, palette.charbon),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(palette.creme, palette.graphite),
    ).toBeGreaterThanOrEqual(4.5);
  });
  it("couleurs fonctionnelles lisibles sur blanc et sur crème", () => {
    for (const c of [
      palette.success,
      palette.warning,
      palette.danger,
      palette.info,
    ]) {
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
  const tokens = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  it("mode sombre système et forcé définissent les mêmes variables", () => {
    const block = (re: RegExp) =>
      [...(tokens.match(re)?.[1] ?? "").matchAll(/(--[a-z0-9-]+):/g)]
        .map((m) => m[1])
        .sort();
    const system = block(
      /:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/,
    );
    const forced = block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
    expect(system.length).toBeGreaterThan(10);
    expect(forced).toEqual(system);
  });
});

describe("refonte A3 (docs/DECISIONS.md) : contrastes mesurés", () => {
  const css = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  const all = (name: string) =>
    [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "g"))].map(
      (m) => m[1]!,
    );
  it("rose de texte et montants retirés lisibles sur le blanc et sur le fond du bandeau (clair)", () => {
    const [ink] = all("highlight-ink");
    const [minus] = all("minus-ink");
    const [soft] = all("highlight-soft");
    for (const c of [ink!, minus!]) {
      expect(contrastRatio(c, palette.blanc)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c, soft!)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("en sombre, le rose de texte reste lisible sur le fond du bandeau", () => {
    const inks = all("highlight-ink");
    const softs = all("highlight-soft");
    expect(contrastRatio(inks.at(-1)!, softs.at(-1)!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
  it("le trait du rythme : 3:1 contre le charbon de la barre ; sur le fond clair il est plus faible, d'où la phrase qui dit le rythme en mots", () => {
    const [vif] = all("evoly-rose-vif");
    expect(contrastRatio(vif!, palette.blanc)).toBeGreaterThanOrEqual(2.5);
    expect(contrastRatio(vif!, palette.charbon)).toBeGreaterThanOrEqual(3);
  });
});
