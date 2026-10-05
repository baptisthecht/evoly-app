import { describe, expect, it } from "vitest";
import { dominantColors, normalizeHexColor, sniffImage } from "../src";

const pixels = (colors: Array<[number, number, number, number, number]>) => {
  const out: number[] = [];
  for (const [r, g, b, a, n] of colors) for (let i = 0; i < n; i++) out.push(r, g, b, a);
  return Uint8ClampedArray.from(out);
};

describe("marque (section 9.19)", () => {
  it("couleurs dominantes d'un logo, sans blancs, noirs, gris ni pixels transparents", () => {
    const logo = pixels([
      [255, 255, 255, 255, 5000],
      [0, 0, 0, 255, 3000],
      [128, 128, 128, 255, 2000],
      [230, 60, 90, 255, 900],
      [232, 62, 92, 255, 300],
      [40, 90, 200, 255, 500],
      [20, 200, 90, 0, 4000],
    ]);
    expect(dominantColors(logo)).toEqual(["#E73D5B", "#285AC8"]);
    expect(dominantColors(pixels([[255, 255, 255, 255, 100]]))).toEqual([]);
  });
  it("deux propositions nettement différentes", () => {
    const logo = pixels([
      [200, 40, 40, 255, 500],
      [210, 45, 45, 255, 400],
      [30, 120, 60, 255, 100],
    ]);
    expect(dominantColors(logo)).toHaveLength(2);
    expect(dominantColors(logo)[1]).toBe("#1E783C");
  });
  it("type réel des images importées", () => {
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg xmlns"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
  it("couleurs saisies", () => {
    expect(normalizeHexColor("ffb8e8")).toBe("#FFB8E8");
    expect(normalizeHexColor(" #abc ")).toBe("#AABBCC");
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("rouge")).toBeNull();
  });
});

describe("logos SVG (RG-FILE-01)", async () => {
  const { isSvg, svgIsSafe } = await import("../src");
  const enc = (s: string) => new TextEncoder().encode(s);
  it("reconnaît un SVG, avec ou sans déclaration XML", () => {
    expect(isSvg(enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(true);
    expect(isSvg(enc('\uFEFF<?xml version="1.0"?>\n<svg></svg>'))).toBe(true);
    expect(isSvg(enc("<html><body></body></html>"))).toBe(false);
  });
  it("refuse scripts, gestionnaires, références externes et entités ; accepte liens internes et images intégrées", () => {
    const ok =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/><use xlink:href="#g"/><image href="data:image/png;base64,AAAA"/></svg>';
    expect(svgIsSafe(ok)).toBe(true);
    for (const bad of [
      "<svg><script>alert(1)</script></svg>",
      '<svg><rect onload="x()"/></svg>',
      '<svg><image href="https://pirate.example/x.png"/></svg>',
      '<svg><use xlink:href="file:///etc/passwd"/></svg>',
      '<svg><rect style="fill:url(https://x/y)"/></svg>',
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
      "<svg><foreignObject><div/></foreignObject></svg>",
      '<svg><a href="javascript:alert(1)"/></svg>',
    ])
      expect(svgIsSafe(bad)).toBe(false);
  });
});

describe("certificats des domaines personnalisés (RG-CDM-02)", async () => {
  const { certificateProblem } = await import("../src");
  const now = new Date("2026-10-01T00:00:00Z");
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
  it("invalide, bientôt expiré (renouvellement en échec) ou sain", () => {
    expect(certificateProblem({ authorized: false, validTo: inDays(60) }, now)).toBe("INVALID");
    expect(certificateProblem({ authorized: true, validTo: inDays(-1) }, now)).toBe("INVALID");
    expect(certificateProblem({ authorized: true, validTo: inDays(10) }, now)).toBe("EXPIRING");
    expect(certificateProblem({ authorized: true, validTo: inDays(45) }, now)).toBeNull();
  });
});
