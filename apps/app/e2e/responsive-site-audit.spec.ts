import { type Page, test } from "@playwright/test";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Audit du responsive du site vitrine (pages construites de apps/web/dist servies sur SITE_AUDIT_URL) : rapport, pas d'assertion.
test.skip(!process.env.SITE_AUDIT_URL, "audit lancé à la demande (SITE_AUDIT_URL)");
test.setTimeout(30 * 60_000);

/** Relevé dans la page : débordements horizontaux, textes qui sortent de leur cadre, champs < 16 px (zoom iOS). */
const AUDIT = () => {
  const vw = document.documentElement.clientWidth;
  const all = [...document.body.querySelectorAll("*")] as HTMLElement[];
  const clipped = (el: HTMLElement) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.position === "fixed") return true;
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
        const r = p.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  const describe = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const txt = (el.innerText || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 50);
    return `${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(/\s+/).slice(0, 7).join(".")} [${Math.round(r.left)}→${Math.round(r.right)}] «${txt}»`;
  };
  const off = all.filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || (r.right <= vw + 1 && r.left >= -1)) return false;
    return !clipped(el);
  });
  const set = new Set(off);
  const outer = off.filter((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p as HTMLElement)) return false;
    return true;
  });
  const text = all.filter((el) => {
    if (el instanceof SVGElement) return false; // mesures de débordement non fiables pour le SVG
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) return false;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "visible" || cs.display === "inline" || !el.clientWidth) return false;
    return el.scrollWidth > el.clientWidth + 4; // tolérance : mots décoratifs inclinés (.script)
  });
  const small = [
    ...document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), select, textarea",
    ),
  ]
    .filter((el) => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16)
    .map((el) => `${el.tagName.toLowerCase()}[${(el as HTMLInputElement).type || ""}] ${Math.round(parseFloat(getComputedStyle(el).fontSize))}px`);
  return {
    docOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
    offenders: outer.slice(0, 6).map(describe),
    textOverflow: text.slice(0, 6).map(describe),
    smallInputs: [...new Set(small)],
  };
};

const pages = (dir: string, base = ""): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return pages(p, `${base}/${f}`);
    return f === "index.html" ? [`${base}/`] : [];
  });

test("audit du responsive du site vitrine", async ({ browser }) => {
  const results: Array<Record<string, unknown>> = [];
  const urls = pages("../web/dist").sort();
  for (const width of [320, 360, 390, 430]) {
    const c = await browser.newContext({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true });
    const p: Page = await c.newPage();
    for (const u of urls) {
      await p.goto(process.env.SITE_AUDIT_URL + u, { waitUntil: "load" });
      await p.waitForTimeout(150);
      results.push({ page: u, width, ...(await p.evaluate(AUDIT)) });
    }
    await c.close();
  }
  writeFileSync("/tmp/responsive/site.json", JSON.stringify(results, null, 1));
});
