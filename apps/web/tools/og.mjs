// Images d'aperçu des liens (Open Graph) du site, une par langue : static/og.png (français) et static/og-<langue>.png.
// Rendues par Chromium avec les polices, les couleurs et le logo du site, et la phrase de l'accueil traduite.
// Usage (depuis la racine du dépôt) : node apps/web/tools/og.mjs   puis augmenter OG_VERSION dans build.py.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(join(WEB, "../app/package.json"))("@playwright/test");
const paths = Object.fromEntries([...readFileSync(join(WEB, "paths.py"), "utf8").matchAll(/^(\w+)\s*=\s*['"]([^'"]+)['"]/gm)].map((m) => [m[1], m[2]]));
const src = JSON.parse(readFileSync(join(WEB, "i18n/source.json"), "utf8"));
const hash = (fr) => Object.keys(src).find((h) => src[h] === fr);
const PHRASE = ["votre prochain", "événement", "commence ici"].map(hash);
const LANGS = ["fr", "en", "nl", "de", "es", "it", "pt"];
const words = (lang) => {
  if (lang === "fr") return PHRASE.map((h) => src[h]);
  const t = JSON.parse(readFileSync(join(WEB, `i18n/${lang}.json`), "utf8"));
  return PHRASE.map((h) => t[h]);
};
const LOGO = (cls) =>
  `<svg class="${cls}" viewBox="10 4 380 286" aria-hidden="true"><g fill="currentColor">${["LIVE", "E", "V", "OLOGO", "L", "Y"].map((k) => `<path d="${paths[k]}"/>`).join("")}</g></svg>`;
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}")`;

const html = (lang, [l1, l2, script]) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Poppins:wght@500;600&family=Yellowtail&display=block">
<style>
  :root { --charbon:#222222; --creme:#FFF6F0; --lilas:#F3D9F0; --rose:#FFB8E8; }
  * { margin:0; box-sizing:border-box; }
  body { width:1200px; height:630px; overflow:hidden; position:relative; background:var(--creme); color:var(--charbon); }
  .grain { position:absolute; inset:0; background-image:${GRAIN}; opacity:.07; mix-blend-mode:multiply; }
  .filigrane { position:absolute; width:1180px; right:-420px; bottom:-300px; color:var(--charbon); opacity:.05; transform:rotate(-9deg); }
  .peinture { position:absolute; inset:0; width:1200px; height:630px; }
  .titre { position:absolute; left:84px; top:92px; font-family:"Archivo Black", sans-serif; letter-spacing:-.058em; line-height:.86; }
  .ligne { display:block; white-space:nowrap; }
  .manuscrit { display:inline-block; position:relative; font-family:"Yellowtail", cursive; letter-spacing:0; font-size:1.18em; line-height:.9;
    transform:rotate(-4deg) translateY(.06em); margin-left:-.02em; padding:0 .12em; }
  .manuscrit svg { position:absolute; left:-2%; right:-2%; bottom:.02em; width:104%; height:.42em; z-index:-1; overflow:visible; }
  .point { font-family:"Archivo Black", sans-serif; }
  .pied { position:absolute; left:84px; right:84px; bottom:50px; display:flex; align-items:center; justify-content:space-between;
    font-family:"Poppins", sans-serif; font-weight:600; font-size:24px; letter-spacing:.01em; }
  .pied .logo { height:58px; width:auto; color:var(--charbon); }
  .pied .adresse { display:flex; align-items:center; gap:14px; }
  .pied .adresse::before { content:""; width:44px; height:6px; border-radius:6px; background:var(--rose); }
</style></head><body>
  ${LOGO("filigrane")}
  <svg class="peinture" viewBox="0 0 1200 630" aria-hidden="true">
    <path d="M-60 505 C 240 455, 420 545, 680 495 S 1010 445, 1260 485" fill="none" stroke="var(--lilas)" stroke-width="58" stroke-linecap="round"/>
    <path d="M930 -30 C 1010 60, 1120 40, 1250 120" fill="none" stroke="var(--lilas)" stroke-width="64" stroke-linecap="round"/>
    <path d="M1032 168 C 1080 190, 1130 196, 1180 186" fill="none" stroke="var(--rose)" stroke-width="16" stroke-linecap="round" opacity=".85"/>
  </svg>
  <div class="grain"></div>
  <h1 class="titre" id="titre">
    <span class="ligne">${l1}</span>
    <span class="ligne">${l2}</span>
    <span class="ligne"><span class="manuscrit">${script}<svg viewBox="0 0 200 40" preserveAspectRatio="none"><path d="M6 26 C 54 12, 130 10, 194 22" fill="none" stroke="var(--rose)" stroke-width="22" stroke-linecap="round"/></svg></span></span>
  </h1>
  <div class="pied">${LOGO("logo")}<span class="adresse">evoly.me</span></div>
  <script>
    // taille du titre ajustée à la langue : la plus grande qui tient dans la largeur et la hauteur disponibles
    async function ajuster() {
      await document.fonts.ready;
      const t = document.getElementById("titre");
      for (let px = 132; px >= 60; px -= 2) {
        t.style.fontSize = px + "px";
        const r = t.getBoundingClientRect();
        if (r.width <= 1010 && r.bottom <= 440) break;
      }
      document.body.dataset.pret = "1";
    }
    ajuster();
  </script>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const lang of LANGS) {
  await page.setContent(html(lang, words(lang)), { waitUntil: "networkidle" });
  await page.waitForSelector("body[data-pret='1']");
  const out = join(WEB, "static", lang === "fr" ? "og.png" : `og-${lang}.png`);
  await page.screenshot({ path: out, type: "png" });
  console.log(`${lang} : ${out.replace(WEB + "/", "")} · ${words(lang).join(" ")}`);
}
await browser.close();
