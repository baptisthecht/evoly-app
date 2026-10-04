import { expect, test } from "@playwright/test";
import { organizer } from "./helpers";

test("aide au prix : ce que l'organisateur veut toucher → prix payé par le participant, prix ronds", async ({ page }) => {
  const { slug } = await organizer(page);
  await page.goto(`/o/${slug}/events/new`);
  // 20 € voulus en Free : 21,29 € (0,72 € de commission, 0,57 € de frais de paiement)
  await page.getByLabel("Vous touchez").fill("20");
  await expect(page.locator("#ticketPrice")).toHaveValue("21,29");
  if (process.env.PRICE_SHOT) await page.locator("#ticketPrice").locator("xpath=ancestor::fieldset").screenshot({ path: process.env.PRICE_SHOT });
  // prix rond : 21 €, l'organisateur voit ce qu'il touche alors
  await page.getByRole("button", { name: /^21(,00)?\s?€ · vous touchez 19,72\s?€$/ }).click();
  await expect(page.locator("#ticketPrice")).toHaveValue("21");
  await expect(page.getByLabel("Vous touchez")).toHaveValue("19,72");
  // l'inverse : le prix payé par le participant, le montant touché se met à jour
  await page.locator("#ticketPrice").fill("10");
  await expect(page.getByLabel("Vous touchez")).toHaveValue("9,11"); // 10 € − 0,49 € − 0,40 €
});
