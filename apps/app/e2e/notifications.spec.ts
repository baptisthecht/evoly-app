import { expect, test } from "@playwright/test";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("notifications : cloche, ouverture de l'élément, annulation d'une entrée (sections 9.20 et 9.17)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Concert ${id}`, 30);
  await buyFree(page, siteUrl(slug, `/concert-${id}`), "Fosse", 1, `lea.${id}@exemple.be`);

  await page.goto(appUrl(`/o/${slug}`));
  await expect(page.getByTestId("unread-count").first()).toHaveText("1");
  await page.goto(appUrl(`/o/${slug}/notifications`));
  await page.getByRole("button", { name: new RegExp(`Concert ${id}`) }).click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  await expect(page.getByTestId("unread-count")).toHaveCount(0);

  // RG-SCN-02 : entrée annulée avec motif, le billet redevient valable
  sql(
    `update "Ticket" set status = 'CHECKED_IN', "checkedInAt" = now() where "orderId" = (select id from "Order" where "buyerEmail" = 'lea.${id}@exemple.be')`,
  );
  await page.reload();
  await page.getByRole("button", { name: "Annuler l’entrée" }).click();
  await page.getByLabel("Motif de l’annulation").fill("Scanné par erreur");
  await page.getByRole("button", { name: "Annuler l’entrée" }).click();
  await expect(page.getByText("Valide", { exact: true })).toBeVisible();
  expect(
    sql(
      `select note from "CheckIn" where result = 'REVERTED' and "ticketId" = (select id from "Ticket" where "orderId" = (select id from "Order" where "buyerEmail" = 'lea.${id}@exemple.be'))`,
    ),
  ).toBe("Scanné par erreur");
});
