import { expect, test } from "./fixtures";
import { organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("vestiaire acheté seul : option vendable sans billet, panier sans billet, commande avec ses codes de retrait (RG-OPT-03)", async ({
  page,
  browser,
}) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Gala ${id}`, 20);
  const eventId = eventUrl.split("/").pop()!;
  const orgId = sql(
    `select "organizationId" from "Event" where id = '${eventId}'`,
  );
  sql(
    `update "Subscription" set "planId" = 'pro', status = 'ACTIVE' where "organizationId" = '${orgId}'`,
  ); // passage en Pro simulé en base

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
  expect(
    sql(
      `select string_agg(name || '=' || standalone, ',' order by name) from "EventOption" where "eventId" = '${eventId}'`,
    ),
  ).toBe("Jeton boisson=false,Vestiaire=true");

  // page publique, sans billet : le jeton reste grisé, le vestiaire s'ajoute seul
  const eventSlug = sql(`select slug from "Event" where id = '${eventId}'`);
  await page.goto(siteUrl(slug, `/${eventSlug}`));
  const box = page.locator("#billets");
  await expect(
    box.getByRole("button", { name: "Jeton boisson, un de plus" }),
  ).toBeDisabled();
  await expect(box.getByRole("button", { name: "Continuer" })).toBeDisabled();
  await box.getByRole("button", { name: "Vestiaire, un de plus" }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(`vestiaire${id}@exemple.be`);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await page.waitForURL(/\/billets\//, { timeout: 20_000 }); // la confirmation mène à la page des billets

  // la commande : aucun billet, le vestiaire, et ses codes de retrait
  await expect
    .poll(
      () => sql(`select status from "Order" where "eventId" = '${eventId}'`),
      { timeout: 20_000 },
    )
    .toBe("PAID");
  const orderId = sql(`select id from "Order" where "eventId" = '${eventId}'`);
  expect(
    sql(`select count(*) from "Ticket" where "orderId" = '${orderId}'`),
  ).toBe("0");
  expect(
    sql(
      `select o.name || ' x' || l.quantity from "OrderOption" l join "EventOption" o on o.id = l."optionId" where l."orderId" = '${orderId}'`,
    ),
  ).toBe("Vestiaire x1");
  expect(
    sql(
      `select ("optionsCode" is not null and "optionsShortCode" is not null)::text from "Order" where id = '${orderId}'`,
    ),
  ).toBe("true");

  // au bar : le code court de retrait retrouve le vestiaire, et le retrait se fait comme pour un billet
  const passCode = sql(
    `select "optionsShortCode" from "Order" where id = '${orderId}'`,
  );
  await page.goto(`${eventUrl}/entries`);
  await page.getByRole("button", { name: "+ Nouveau lien bénévole" }).click();
  await page.getByLabel("Libellé").fill("Vestiaire");
  await page.getByRole("button", { name: "Créer le lien" }).click();
  const url = (await page.getByTestId("scanner-url").textContent())!;
  const staff = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "fr-BE",
  });
  const bar = await staff.newPage();
  await bar.goto(url);
  await bar.getByRole("button", { name: "Bar et options" }).click();
  await bar.getByLabel("Code court").fill(passCode);
  await bar.getByRole("button", { name: "Valider" }).click();
  await expect(bar.getByText("1 sur 1 restant(s)")).toBeVisible();
  await bar.getByRole("button", { name: "Retirer 1" }).click();
  await expect(bar.getByText("0 sur 1 restant(s)")).toBeVisible();
  await expect
    .poll(() =>
      sql(`select redeemed from "OrderOption" where "orderId" = '${orderId}'`),
    )
    .toBe("1");

  // vente sur place : le vendeur encaisse un vestiaire depuis l'onglet Vente et donne le code de retrait au client
  sql(
    `update "ScannerLink" set "canSell" = true where "eventId" = '${eventId}' and label = 'Vestiaire'`,
  );
  await bar.reload();
  await bar.getByRole("button", { name: "Vente" }).click();
  await bar.getByRole("button", { name: "+ Vestiaire" }).click();
  await bar.getByRole("button", { name: /^Encaisser .* en espèces$/ }).click();
  await expect(bar.getByText("Vente enregistrée.")).toBeVisible();
  await expect(
    bar.getByText("Code de retrait à donner au client"),
  ).toBeVisible();
  await expect
    .poll(() =>
      sql(
        `select count(*) from "Order" where "eventId" = '${eventId}' and source = 'BOX_OFFICE' and "optionsShortCode" is not null`,
      ),
    )
    .toBe("1");
});
