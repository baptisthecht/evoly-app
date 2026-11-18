import { expect, test } from "./fixtures";
import { organizer } from "./helpers";

test("aide au prix : ce que l'organisateur veut percevoir → prix payé par le participant, prix ronds", async ({
  page,
}) => {
  const { slug } = await organizer(page);
  await page.goto(`/o/${slug}/events/new`);
  // 20 € voulus en Free : 21,35 € (0,72 € de commission, 0,63 € de frais de paiement, grille de Mollie)
  await page.getByLabel("Vous percevez").fill("20");
  await expect(page.locator("#ticketPrice")).toHaveValue("21,35");
  if (process.env.PRICE_SHOT)
    await page
      .locator("#ticketPrice")
      .locator("xpath=ancestor::fieldset")
      .screenshot({ path: process.env.PRICE_SHOT });
  // prix rond : 21 €, l'organisateur voit ce qu'il perçoit alors
  await page
    .getByRole("button", { name: /^21(,00)?\s?€ · vous percevez 19,66\s?€$/ })
    .click();
  await expect(page.locator("#ticketPrice")).toHaveValue("21");
  await expect(page.getByLabel("Vous percevez")).toHaveValue("19,66");
  // l'inverse : le prix payé par le participant, le montant perçu se met à jour
  await page.locator("#ticketPrice").fill("10");
  await expect(page.getByLabel("Vous percevez")).toHaveValue("9,08"); // 10 € − 0,49 € − 0,43 €
});
