import { expect, test } from "@playwright/test";
import { lastEmail, firstLink } from "./outbox";
import { organizer, publishedFreeEvent, siteUrl } from "./helpers";

test("achat gratuit : réservation, coordonnées, billets avec QR codes, e-mail, puis complet", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const title = `Apéro ${id}`;
  const eventUrl = await publishedFreeEvent(page, slug, title, 2);

  await page.goto(siteUrl(slug, `/apero-${id}`));
  const tickets = page.locator("#billets");
  await tickets.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await tickets.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await tickets.getByRole("button", { name: "Continuer" }).click();
  await expect(tickets.getByText("Vos places sont réservées pendant")).toBeVisible();
  await expect(tickets.getByText("2 × Fosse")).toBeVisible();

  // coordonnées : contrôle des champs, puis suggestion sur une faute de domaine
  await tickets.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await expect(tickets.getByText("Obligatoire.").first()).toBeVisible();
  const email = `lea.${id}@gmial.com`;
  await tickets.getByLabel("Prénom").fill("Léa");
  await tickets.getByLabel("Nom", { exact: true }).fill("Martin");
  await tickets.getByLabel("Adresse e-mail").fill(email);
  await tickets.getByRole("button", { name: `Vouliez-vous dire lea.${id}@gmail.com ?` }).click();
  await expect(tickets.getByLabel("Adresse e-mail")).toHaveValue(`lea.${id}@gmail.com`);
  await tickets.getByRole("button", { name: "Confirmer ma réservation" }).click();

  await page.waitForURL(/\/billets\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole("heading", { name: "Vos billets" })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code du billet/ })).toHaveCount(2);
  const ticketsUrl = page.url();

  // e-mail de confirmation avec le lien magique
  const mail = await lastEmail(`lea.${id}@gmail.com`, "order.confirmation");
  expect(mail.subject).toBe(`Vos billets pour ${title}`);
  expect(firstLink(mail.text)).toBe(ticketsUrl);

  // fichier calendrier
  // téléchargé depuis la page : seul le navigateur résout les sous-domaines de localhost
  const ics = await page.evaluate(async (url) => {
    const r = await fetch(url);
    return { status: r.status, type: r.headers.get("content-type"), body: await r.text() };
  }, `${ticketsUrl}/calendrier.ics`);
  expect(ics.status).toBe(200);
  expect(ics.type).toContain("text/calendar");
  expect(ics.body).toContain(`SUMMARY:${title}`);

  // les 2 places sont vendues : la page affiche « Complet »
  await page.goto(siteUrl(slug, `/apero-${id}`));
  await expect(page.locator("#billets").getByText("Complet")).toBeVisible();
  await page.goto(eventUrl);
  await expect(page.getByText("2 / 2")).toBeVisible();
});

test("lien magique invalide : page introuvable", async ({ page }) => {
  const { slug } = await organizer(page);
  const res = await page.goto(siteUrl(slug, `/billets/${"x".repeat(43)}`));
  expect(res?.status()).toBe(404);
});
