import { expect, test } from "@playwright/test";
import { firstLink, lastEmail } from "./outbox";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl } from "./helpers";

test("commandes : recherche, détail, renvoi des billets, correction de l'e-mail (RG-ORD-01, RG-ORD-02)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Concert ${id}`, 10);
  await buyFree(page, siteUrl(slug, `/concert-${id}`), "Fosse", 2, `lea.${id}@exemple.be`);
  const oldLink = page.url();

  await page.goto(appUrl(`/o/${slug}/orders`));
  await page.getByLabel("Rechercher une commande").fill("Léa Martin");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await expect(page.getByText("1 commande")).toBeVisible();
  await page.getByText(`lea.${id}@exemple.be`).click();
  await expect(page.getByRole("heading", { name: "Léa Martin" })).toBeVisible();
  await expect(page.getByText("2 billets", { exact: true })).toBeVisible();
  await expect(page.getByText(`Vos billets pour Concert ${id}`)).toHaveCount(1);

  await page.getByRole("button", { name: "Renvoyer les billets" }).click();
  await expect(page.getByText("Billets renvoyés.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Vos billets pour Concert ${id}`)).toHaveCount(2);

  const newEmail = `lea.martin.${id}@exemple.be`;
  await page.getByRole("button", { name: "Corriger l’e-mail" }).click();
  await page.getByLabel("Nouvelle adresse e-mail").fill(newEmail);
  await page.getByRole("button", { name: "Enregistrer et envoyer" }).click();
  await expect(page.getByText("Adresse corrigée, billets envoyés.")).toBeVisible();
  expect((await page.goto(oldLink))?.status()).toBe(404);
  const link = firstLink((await lastEmail(newEmail, "order.confirmation")).text);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Vos billets" })).toBeVisible();
});

test("remboursement sur demande : l'acheteur demande, l'organisateur accepte (US-REF-01, US-REF-02)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Atelier ${id}`, 10);
  await buyFree(page, siteUrl(slug, `/atelier-${id}`), "Fosse", 2, `lea.${id}@exemple.be`);
  const tickets = page.url();

  await page.getByRole("button", { name: "Demander un remboursement" }).click();
  await expect(page.getByText("L’organisateur étudiera votre demande et vous répondra par e-mail.")).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await page.getByLabel("Message à l’organisateur (facultatif)").fill("Je ne pourrai pas venir.");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.getByText("Demande de remboursement en attente pour 1 billet")).toBeVisible();

  await page.goto(appUrl(`/o/${slug}/orders`));
  await page.getByRole("link", { name: /1 demande de remboursement en attente/ }).click();
  await expect(page.getByText("1 commande")).toBeVisible();
  await page.getByText(`lea.${id}@exemple.be`).click();
  await expect(page.getByText("« Je ne pourrai pas venir. »")).toBeVisible();
  await page.getByLabel("Réponse à l’acheteur").fill("Bien reçu, à une prochaine fois.");
  await page.getByRole("button", { name: "Accepter et rembourser" }).click();
  await expect(page.getByText("Remboursé", { exact: true }).first()).toBeVisible();

  await page.goto(tickets);
  await expect(page.getByText("Remboursement envoyé pour 1 billet")).toBeVisible();
  await expect(page.getByText("Billet remboursé")).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code du billet/ })).toHaveCount(1);
  expect((await lastEmail(`lea.${id}@exemple.be`, "refund.processed")).subject).toBe(`Remboursement pour Atelier ${id}`);
});

test("annulation d'un événement : double confirmation, page publique, acheteurs prévenus (RG-REF-07)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Pique-nique ${id}`, 10);
  await buyFree(page, siteUrl(slug, `/pique-nique-${id}`), "Fosse", 1, `lea.${id}@exemple.be`);
  const tickets = page.url();

  await page.goto(eventUrl);
  await page.getByRole("button", { name: "Annuler l’événement", exact: true }).click();
  await expect(page.getByText("Aucune commande payée à rembourser.", { exact: false })).toBeVisible();
  await page.getByLabel("Motif de l’annulation").fill("Alerte météo : orages violents annoncés.");
  await page.getByLabel(/Pour confirmer, saisissez le titre/).fill("Pique-nique");
  await page.getByRole("button", { name: "Annuler l’événement et rembourser" }).click();
  await expect(page.getByText("Le titre saisi ne correspond pas à celui de l’événement.")).toBeVisible();
  await page.getByLabel(/Pour confirmer, saisissez le titre/).fill(`Pique-nique ${id}`);
  await page.getByRole("button", { name: "Annuler l’événement et rembourser" }).click();
  await expect(page.getByText("Événement annulé. Motif : Alerte météo", { exact: false })).toBeVisible();

  await page.goto(siteUrl(slug, `/pique-nique-${id}`));
  await expect(page.getByText("Cet événement est annulé.", { exact: false })).toBeVisible();
  expect((await lastEmail(`lea.${id}@exemple.be`, "refund.cancelled")).subject).toBe(`Événement annulé : Pique-nique ${id}`);
  await page.goto(tickets);
  await expect(page.getByRole("heading", { name: "Événement annulé" })).toBeVisible();
});
