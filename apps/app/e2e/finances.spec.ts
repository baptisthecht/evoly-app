import { expect, test } from "@playwright/test";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("finances : totaux, exports CSV et relevé mensuel en PDF", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Bal ${id}`, 10);
  await buyFree(page, siteUrl(slug, `/bal-${id}`), "Fosse", 2, `lea.${id}@exemple.be`);
  // commande payée simulée : 48 € dont 1,02 € de commission et 0,97 € de frais Stripe réels, payée le mois dernier
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `update "Order" set "totalMinor" = 4800, "subtotalMinor" = 4800, "applicationFeeMinor" = 102, "paymentFeeMinor" = 97, "netMinor" = 4601, "paidAt" = date_trunc('month', now()) - interval '3 days' where "organizationId" = '${orgId}'`,
  );
  const reference = sql(`select reference from "Order" where "organizationId" = '${orgId}'`);
  // deux jetons boissons vendus sur cette commande, dont un retiré au bar (RG-OPT-08)
  const orderId = sql(`select id from "Order" where "organizationId" = '${orgId}'`);
  sql(
    `insert into "EventOption" (id, "eventId", name, "priceMinor", "updatedAt") select 'opt-${id}', "eventId", 'Jeton boisson', 300, now() from "Order" where id = '${orderId}'`,
  );
  sql(
    `insert into "OrderOption" (id, "orderId", "optionId", quantity, "unitPriceMinor", "unitFeeMinor", redeemed) values ('oo-${id}', '${orderId}', 'opt-${id}', 2, 300, 6, 1)`,
  );

  await page.goto(appUrl(`/o/${slug}/finances?period=ALL`));
  await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible();
  const cards = page.getByRole("region", { name: "Totaux de la période" });
  await expect(cards).toContainText("48,00");
  await expect(cards).toContainText("1,02");
  await expect(cards).toContainText("46,01");
  await expect(page.getByRole("rowheader", { name: `Bal ${id}` })).toBeVisible();

  const csv = await page.request.get(appUrl(`/o/${slug}/finances/export/orders?period=ALL`));
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const commandes = await csv.text();
  expect(commandes).toContain(`${reference};`);
  expect(commandes.split("\r\n")[0]).toMatch(/;Options;Montant des options$/); // colonnes ajoutées en fin de ligne
  expect(commandes).toMatch(/;2 × Jeton boisson;6,00\r\n/);

  // section « Options et consommations » et export des options (RG-OPT-08)
  const section = page.getByRole("rowheader", { name: "Jeton boisson" });
  await expect(section).toBeVisible();
  await expect(page.getByRole("heading", { name: "Options et consommations" })).toBeVisible();
  const options = await page.request.get(appUrl(`/o/${slug}/finances/export/options?period=ALL`));
  expect(options.status()).toBe(200);
  expect(options.headers()["content-type"]).toContain("text/csv");
  const lignes = (await options.text())
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\r\n");
  expect(lignes).toHaveLength(2);
  expect(lignes[1]).toContain(`${reference};`);
  expect(lignes[1]).toMatch(/;Jeton boisson;2;3,00;6,00;0,12;1;EUR;PAID$/);

  await page
    .getByRole("link", { name: "Télécharger le relevé" })
    .first()
    .click({ modifiers: [] })
    .catch(() => undefined);
  const period = sql(`select to_char((date_trunc('month', now()) - interval '3 days') at time zone 'Europe/Brussels', 'YYYY-MM')`);
  const pdf = await page.request.get(appUrl(`/o/${slug}/finances/statements/${period}`));
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page.goto(appUrl(`/o/${slug}/finances?period=ALL`));
  await expect(page.getByRole("link", { name: /Télécharger le n° EVO-\d{4}-\d{6}/ })).toBeVisible();
});
