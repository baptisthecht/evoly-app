import { expect, test } from "@playwright/test";
import { organizer, publishedFreeEvent, siteUrl } from "./helpers";

test("référencement des billetteries : aperçus de liens, données structurées, image générée, robots.txt et sitemap", async ({ page, request }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Festival ${id}`, 20);
  // comme un robot : requête directe, billetterie désignée par l'en-tête Host
  const viaHost = (url: string) => { const u = new URL(url); return request.get(`http://localhost:${u.port}${u.pathname}`, { headers: { host: u.host } }); };
  const html = await (await viaHost(siteUrl(slug, `/festival-${id}`))).text();
  const meta = (attr: string, key: string) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1] ?? null;
  expect(html).toMatch(new RegExp(`<title>Festival ${id} · .+ - Billets \\| `));
  expect(meta("name", "twitter:card")).toBe("summary_large_image");
  expect(meta("property", "og:site_name")).toBeTruthy();
  const og = meta("property", "og:image")!;
  expect(og).toContain("/api/og/event/");
  expect(meta("name", "description")).toContain("Réservation en ligne sécurisée");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!);
  expect(ld).toMatchObject({ "@type": "Event", name: `Festival ${id}` });
  expect(ld.image[0]).toContain("/api/og/event/");
  expect(ld.offers[0].url).toContain(`/festival-${id}`);

  const img = await request.get(og.replace(/^https?:\/\/[^/]+/, ""));
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  expect((await img.body()).length).toBeGreaterThan(5000);

  const robots = await (await viaHost(siteUrl(slug, "/robots.txt"))).text();
  expect(robots).toContain("User-agent: GPTBot");
  expect(robots).toContain("User-agent: ClaudeBot");
  expect(robots).toContain("Disallow: /billets/");
  expect(robots).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  const sitemap = await (await viaHost(siteUrl(slug, "/sitemap.xml"))).text();
  expect(sitemap).toContain(`/festival-${id}</loc>`);
  expect(await (await request.get("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
});
