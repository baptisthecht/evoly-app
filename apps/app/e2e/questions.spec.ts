import { expect, test } from "@playwright/test";
import { appUrl, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("questions à l'achat : création, réponses exigées, réponses dans la commande (US-QST-01)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Dîner ${id}`, 30);
  await page.goto(`${eventUrl}/tickets`);
  await page.getByRole("button", { name: "+ Ajouter une question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Comment nous avez-vous connus ?");
  await page.getByLabel("Réponse obligatoire").check();
  await page.getByRole("button", { name: "Enregistrer la question" }).click();
  await expect(page.getByText("Comment nous avez-vous connus ?")).toBeVisible();
  await page.getByRole("button", { name: "+ Ajouter une question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Régime alimentaire");
  await page.getByLabel("Type de réponse").selectOption("SELECT");
  await page.getByLabel("Choix proposés").fill("Aucun\nVégétarien\nSans gluten");
  await page.getByLabel("Pour chaque billet").check();
  await page.getByRole("button", { name: "Enregistrer la question" }).click();
  await expect(page.getByText("Régime alimentaire")).toBeVisible();

  await page.goto(siteUrl(slug, `/diner-${id}`));
  const box = page.locator("#billets");
  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(`lea.${id}@exemple.be`);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await expect(box.getByRole("alert").first()).toBeVisible();
  await box.getByLabel("Comment nous avez-vous connus ?").fill("Un ami");
  const diets = box.getByLabel(/Régime alimentaire/);
  await diets.nth(0).selectOption("Végétarien");
  await diets.nth(1).selectOption("Sans gluten");
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await page.waitForURL(/\/billets\//);

  const orderId = sql(`select id from "Order" where "buyerEmail" = 'lea.${id}@exemple.be'`);
  await page.goto(appUrl(`/o/${slug}/orders/${orderId}`));
  const answers = page.getByRole("heading", { name: "Réponses aux questions" }).locator("xpath=..");
  await expect(answers).toContainText("Un ami");
  await expect(answers).toContainText("Végétarien");
  await expect(answers).toContainText("Sans gluten");
});

test("événement privé : code d'accès avant affichage et avant réservation (RG-PUB-06)", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Gala ${id}`, 30);
  await page.goto(`${eventUrl}/settings`);
  await page.getByLabel("Visibilité").selectOption("PRIVATE");
  await page.getByLabel("Code d’accès").fill("gala 2026");
  await expect.poll(() => sql(`select coalesce("accessCodeHash", '') <> '' from "Event" where slug = 'gala-${id}'`), { timeout: 10_000 }).toBe("t");

  const guest = await browser.newContext({ locale: "fr-BE" });
  const g = await guest.newPage();
  await g.goto(siteUrl(slug, `/gala-${id}`));
  await expect(g.getByRole("heading", { name: "Événement privé" })).toBeVisible();
  await expect(g.getByText(`Gala ${id}`)).toHaveCount(0);
  await g.getByLabel("Code d’accès").fill("MAUVAIS");
  await g.getByRole("button", { name: "Accéder à l’événement" }).click();
  await expect(g.getByText("Code incorrect.")).toBeVisible();
  await g.getByLabel("Code d’accès").fill("GALA2026");
  await g.getByRole("button", { name: "Accéder à l’événement" }).click();
  await expect(g.getByRole("heading", { name: `Gala ${id}` })).toBeVisible();
  await g.locator("#billets").getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await g.locator("#billets").getByRole("button", { name: "Continuer" }).click();
  await expect(g.locator("#billets").getByLabel("Adresse e-mail")).toBeVisible();
  await guest.close();
});
