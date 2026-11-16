import { expect, test } from "./fixtures";
import {
  appUrl,
  buyFree,
  organizer,
  publishedFreeEvent,
  siteUrl,
} from "./helpers";

test("personnes bloquées : bloquer un acheteur depuis sa commande, refus neutre, nom signalé, déblocage", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Concert ${id}`, 10);
  const eventPage = siteUrl(slug, `/concert-${id}`);
  await buyFree(page, eventPage, "Fosse", 1, `lea.${id}@gmail.com`);

  // fiche de la commande, onglet « Acheteur » : « Bloquer cet acheteur », adresse et nom préremplis
  await page.goto(appUrl(`/o/${slug}/orders`));
  await page.getByRole("link", { name: "Léa Martin" }).click();
  await page
    .getByRole("navigation", { name: "Sections de la commande" })
    .getByRole("link", { name: "Acheteur" })
    .click();
  await page.getByRole("button", { name: "Bloquer cet acheteur" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Adresse e-mail")).toHaveValue(
    `lea.${id}@gmail.com`,
  );
  await expect(dialog.getByLabel("Prénom")).toHaveValue("Léa");
  await expect(
    dialog.getByText("Aucune carte enregistrée dans ses commandes chez vous."),
  ).toBeVisible();
  await dialog.getByLabel("Motif").fill("Revente sauvage");
  await dialog.getByRole("button", { name: "Bloquer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Cette adresse est déjà bloquée.")).toBeVisible();

  // onglet « Personnes bloquées » : la ligne, son motif, visible de l'organisation seule
  await page.getByRole("link", { name: "Voir les personnes bloquées" }).click();
  await expect(
    page.getByRole("link", { name: "Personnes bloquées" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(`lea.${id}@gmail.com`)).toBeVisible();
  await expect(page.getByText("Revente sauvage")).toBeVisible();

  // l'acheteur bloqué, avec une variante de son adresse : message neutre, sans motif
  await page.goto(eventPage);
  const box = page.locator("#billets");
  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(`L.E.A.${id}+bis@gmail.com`);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await expect(
    box.getByText(
      "Cette commande ne peut pas aboutir. Contactez l’organisateur.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Revente sauvage")).toHaveCount(0);

  // même nom, autre adresse : la commande passe, signalée dans le tableau des commandes
  await buyFree(page, eventPage, "Fosse", 1, `homonyme.${id}@exemple.be`);
  await page.goto(appUrl(`/o/${slug}/orders`));
  await expect(page.getByText("Signalé", { exact: true })).toHaveCount(1);

  // « Débloquer », après confirmation ; puis « Bloquer une personne » depuis la bande du titre
  await page.goto(appUrl(`/o/${slug}/orders?tab=blocked`));
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Débloquer" }).click();
  await expect(page.getByText("Aucune personne bloquée.")).toBeVisible();
  await page
    .getByRole("button", { name: "Bloquer une personne" })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Adresse e-mail")
    .fill(`nuisible.${id}@exemple.be`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Bloquer", exact: true })
    .click();
  await expect(page.getByText(`nuisible.${id}@exemple.be`)).toBeVisible();
});
