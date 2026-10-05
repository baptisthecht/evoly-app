import { expect, test } from "@playwright/test";
import { appUrl, organizer, siteUrl } from "./helpers";

test("application installable sur app.evoly.me : manifeste, icônes, service worker actif ; rien sur les billetteries", async ({ page, request, browser }) => {
  // manifeste, dans la langue du navigateur
  const res = await request.get(appUrl("/app.webmanifest"), { headers: { "Accept-Language": "de-DE,de;q=0.9" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const m = await res.json();
  expect(m).toMatchObject({ id: "/", name: "Evoly", short_name: "Evoly", lang: "de", start_url: "/", scope: "/", display: "standalone" });
  expect(m.description).toContain("Online-Ticketing");
  expect(m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
  for (const icon of m.icons as Array<{ src: string; type: string }>) {
    const r = await request.get(appUrl(icon.src));
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"], icon.src).toContain(icon.type);
  }
  const sw = await request.get(appUrl("/app-sw.js"));
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");

  // déclaré dans la page, service worker actif sur tout l'hôte
  await page.goto(appUrl("/login"));
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/app.webmanifest");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(appUrl("/"));
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), "page contrôlée par le service worker").toBe(true);
  // la page « hors ligne » est vérifiée par test/app-sw.test.ts : la coupure réseau simulée par Playwright
  // n'atteint pas les requêtes du service worker lui-même

  // comportement d'app : pas d'étirement au-delà des bords ; zoom conservé dans le navigateur (accessibilité)
  await expect(page.locator("html")).toHaveClass(/app-host/);
  expect(await page.evaluate(() => getComputedStyle(document.body).overscrollBehaviorY)).toBe("none");
  expect(await page.locator('meta[name="viewport"]').getAttribute("content")).not.toContain("user-scalable");

  // app installée (affichage « standalone » simulé) : plus de zoom à deux doigts
  const installed = await browser.newContext();
  await installed.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes("display-mode: standalone") ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList) : original(q));
  });
  const app = await installed.newPage();
  await app.goto(appUrl("/login"));
  await expect(app.locator('meta[name="viewport"]')).toHaveAttribute("content", /maximum-scale=1, user-scalable=no/);
  await installed.close();

  // billetterie d'un organisateur : ni manifeste ni service worker (ses acheteurs ne doivent pas installer « Evoly »)
  const { slug } = await organizer(page);
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(siteUrl(slug));
  await expect(guest.locator('link[rel="manifest"]')).toHaveCount(0);
  await expect(guest.locator("html")).not.toHaveClass(/app-host/); // page web normale : étirement et zoom habituels
  // depuis la page de la billetterie (Node ne résout pas les sous-domaines de localhost, le navigateur si)
  const statuses = await guest.evaluate(async () => Promise.all(["/app.webmanifest", "/app-sw.js"].map(async (u) => (await fetch(u)).status)));
  expect(statuses).toEqual([404, 404]);
});
