import { expect, test } from "@playwright/test";
import { appUrl, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("e-mail de chaque titulaire, puis accès membre au scanner depuis scanner.evoly.me (RG-QST-01, US-SCN-06)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Stage ${id}`, 20);
  sql(`update "TicketType" set "isNominative" = true, "requireHolderEmail" = true where "eventId" = (select id from "Event" where slug = 'stage-${id}')`);
  sql(`update "Event" set "startsAt" = now() + interval '1 day' where slug = 'stage-${id}'`);

  await page.goto(siteUrl(slug, `/stage-${id}`));
  const box = page.locator("#billets");
  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(`lea.${id}@exemple.be`);
  await box.getByRole("button", { name: "C’est moi" }).click();
  await expect(box.getByLabel(/E-mail du titulaire 1/)).toHaveValue(`lea.${id}@exemple.be`);
  await box.getByLabel(/E-mail du titulaire 1/).fill(`camille.${id}@exemple.be`);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await page.waitForURL(/\/billets\//);
  expect(sql(`select "holderEmail" from "Ticket" where "orderId" = (select id from "Order" where "buyerEmail" = 'lea.${id}@exemple.be')`)).toBe(
    `camille.${id}@exemple.be`,
  );

  // US-SCN-06 : un membre ouvre le scanner depuis scanner.evoly.me
  await page.goto("http://scanner.localhost:3001/");
  await page.getByRole("link", { name: "Je fais partie de l’équipe" }).click();
  await expect(page.getByRole("heading", { name: "Scanner les billets" })).toBeVisible();
  await page
    .getByRole("listitem")
    .filter({ hasText: `Stage ${id}` })
    .getByRole("button", { name: "Ouvrir le scanner" })
    .click();
  await page.waitForURL(/scanner\.localhost:3001\/s\//);
});
