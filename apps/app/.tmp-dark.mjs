import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "evoly_consent", value: encodeURIComponent(JSON.stringify({ v: 1, analytics: false, ads: false, at: "x" })), domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
await p.goto("http://localhost:3001/start", { waitUntil: "networkidle" });
const info = await p.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const label = document.querySelector('label[for="qs-title"]');
  const h1 = document.querySelector("h1");
  const card = label?.closest("[class*='rounded']");
  return {
    dataTheme: document.documentElement.getAttribute("data-theme"),
    htmlClass: document.documentElement.className.slice(0, 120),
    ink: root.getPropertyValue("--ink"), surface: root.getPropertyValue("--surface"), raised: root.getPropertyValue("--surface-raised"), inverse: root.getPropertyValue("--surface-inverse"),
    label: label && getComputedStyle(label).color, h1: h1 && getComputedStyle(h1).color, card: card && getComputedStyle(card).backgroundColor,
    hasPro: !!document.querySelector(".theme-pro"),
  };
});
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: "/tmp/dark-start.png" });
await b.close();
