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

  await page.goto(appUrl(`/o/${slug}/finances?period=ALL`));
  await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible();
  const cards = page.getByRole("region", { name: "Totaux de la période" });
  await expect(cards).toContainText("48,00");
  await expect(cards).toContainText("1,02");
  await expect(cards).toContainText("46,01");
  await expect(page.getByRole("rowheader", { name: `Bal ${id}` })).toBeVisible();

  const csv = await page.request.get(appUrl(`/o/${slug}/finances/export/orders?period=ALL`));
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(`${reference};`);

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
