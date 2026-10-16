import { expect, test } from "@playwright/test";
import { organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("vestiaire acheté seul : option vendable sans billet, panier sans billet, commande avec ses codes de retrait (RG-OPT-03)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Gala ${id}`, 20);
  const eventId = eventUrl.split("/").pop()!;
  const orgId = sql(`select "organizationId" from "Event" where id = '${eventId}'`);
  sql(`update "Subscription" set "planId" = 'pro', status = 'ACTIVE' where "organizationId" = '${orgId}'`); // passage en Pro simulé en base

  // un vestiaire vendable sans billet, un jeton qui exige un billet (gratuits, pour un achat sans paiement)
  await page.goto(`${eventUrl}/options`);
  await page.getByLabel("Nom").fill("Vestiaire");
  await page.getByLabel("Prix").fill("0");
  await page.getByLabel("Vendable sans billet").check();
  await page.getByRole("button", { name: "Ajouter l'option" }).click();
  await expect(page.getByText("Option enregistrée.")).toBeVisible();
  await page.reload();
  const ajout = page.locator("form", { has: page.locator("#option-new-name") }); // le formulaire d'ajout, sous l'option déjà créée
  await ajout.locator("#option-new-name").fill("Jeton boisson");
  await ajout.locator("#option-new-price").fill("0");
  await expect(ajout.getByLabel("Vendable sans billet")).not.toBeChecked(); // décochée par défaut
  await page.getByRole("button", { name: "Ajouter l'option" }).click();
  await expect(page.getByText("Option enregistrée.")).toBeVisible();
  expect(sql(`select string_agg(name || '=' || standalone, ',' order by name) from "EventOption" where "eventId" = '${eventId}'`)).toBe(
    "Jeton boisson=false,Vestiaire=true",
  );

  // page publique, sans billet : le jeton reste grisé, le vestiaire s'ajoute seul
  const eventSlug = sql(`select slug from "Event" where id = '${eventId}'`);
  await page.goto(siteUrl(slug, `/${eventSlug}`));
  const box = page.locator("#billets");
  await expect(box.getByRole("button", { name: "Un billet Jeton boisson de plus" })).toBeDisabled();
  await expect(box.getByRole("button", { name: "Continuer" })).toBeDisabled();
  await box.getByRole("button", { name: "Un billet Vestiaire de plus" }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(`vestiaire${id}@exemple.be`);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();

  // la commande : aucun billet, le vestiaire, et ses codes de retrait
  await expect.poll(() => sql(`select status from "Order" where "eventId" = '${eventId}'`), { timeout: 20_000 }).toBe("PAID");
  const orderId = sql(`select id from "Order" where "eventId" = '${eventId}'`);
  expect(sql(`select count(*) from "Ticket" where "orderId" = '${orderId}'`)).toBe("0");
  expect(sql(`select o.name || ' x' || l.quantity from "OrderOption" l join "EventOption" o on o.id = l."optionId" where l."orderId" = '${orderId}'`)).toBe(
    "Vestiaire x1",
  );
  expect(sql(`select ("optionsCode" is not null and "optionsShortCode" is not null)::text from "Order" where id = '${orderId}'`)).toBe("true");
});
