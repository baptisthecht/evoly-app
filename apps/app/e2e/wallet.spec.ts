import { expect, test } from "@playwright/test";
import { buyFree, organizer, publishedFreeEvent, siteUrl } from "./helpers";

test("billets dans Apple Wallet et Google Wallet depuis la page des billets (US-POST-03)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Concert ${id}`, 20);
  await buyFree(page, siteUrl(slug, `/concert-${id}`), "Fosse", 1, `lea.${id}@exemple.be`);
  const apple = page.getByRole("link", { name: "Ajouter à Apple Wallet" });
  const google = page.getByRole("link", { name: "Ajouter à Google Wallet" });
  await expect(apple).toHaveCount(1);
  await expect(google).toHaveCount(1);
  // le client HTTP de Playwright ne résout pas *.localhost : requête sur localhost avec l'hôte de la billetterie
  const host = new URL(page.url()).host;
  const viaHost = (href: string, opts: { maxRedirects?: number } = {}) =>
    page.request.get(`http://localhost:${new URL(page.url()).port}${href}`, { headers: { host }, ...opts });
  const pkpass = await viaHost((await apple.getAttribute("href"))!);
  expect(pkpass.status()).toBe(200);
  expect(pkpass.headers()["content-type"]).toBe("application/vnd.apple.pkpass");
  expect((await pkpass.body()).subarray(0, 2).toString()).toBe("PK"); // archive ZIP
  const save = await viaHost((await google.getAttribute("href"))!, { maxRedirects: 0 });
  expect(save.status()).toBe(303);
  expect(save.headers()["location"]).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\/[\w-]+\.[\w-]+\.[\w-]+$/);
});
