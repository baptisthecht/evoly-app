import { expect, test } from "@playwright/test";
import { organizer, publishedFreeEvent } from "./helpers";

test("deux onglets modifient le même événement : la dernière sauvegarde l'emporte et l'autre est averti (RG-EVT-10)", async ({ page, context }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Salon ${id}`, 20);
  const other = await context.newPage();
  await page.goto(`${eventUrl}/settings`);
  await other.goto(`${eventUrl}/settings`);
  await page.getByLabel("Billets par commande (maximum)").fill("7");
  await expect(page.getByText("Enregistré", { exact: false }).first()).toBeVisible();
  await other.getByLabel("Billets par commande (maximum)").fill("9");
  await expect(other.getByText("Un autre membre a modifié cet événement", { exact: false })).toBeVisible();
  await expect(page.getByText("Un autre membre a modifié cet événement", { exact: false })).toHaveCount(0);
});
