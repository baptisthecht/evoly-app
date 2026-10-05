import { expect, test } from "@playwright/test";
import { firstLink, lastEmail } from "./outbox";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("revente : transfert gratuit de bout en bout, section publique, retrait d'annonce", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Cabaret ${id}`, 2);
  const publicUrl = siteUrl(slug, `/cabaret-${id}`);
  const sellerEmail = `lea.${id}@exemple.be`;
  await buyFree(page, publicUrl, "Fosse", 2, sellerEmail);
  const sellerTickets = page.url();

  // US-RSL-01 : mise en revente depuis la page des billets
  await page.getByRole("button", { name: "Revendre ce billet" }).first().click();
  await page.getByLabel(/Prix de revente/).fill("0");
  await expect(page.getByText("Transfert gratuit : aucun paiement, aucun remboursement.")).toBeVisible();
  await page.getByRole("button", { name: "Mettre en revente" }).click();
  await expect(page.getByText("En revente : transfert gratuit")).toBeVisible();
  await expect(page.getByText("QR code masqué pendant la revente.", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code du billet/ })).toHaveCount(1);
  const shortUrl = (await page.getByTestId("resale-url").textContent())!;
  expect(shortUrl).toMatch(/^http:\/\/localhost:3001\/r\/cabaret-[A-Z0-9]{4}$/);

  // RG-EVT-04 : complet, la section Revente est mise en avant
  const buyer = await browser.newContext({ locale: "fr-BE", extraHTTPHeaders: { "x-forwarded-for": `10.4.${Math.floor(Math.random() * 250)}.9` } });
  const b = await buyer.newPage();
  await b.goto(publicUrl);
  await expect(b.locator("#billets").getByText("Complet")).toBeVisible();
  await expect(b.getByRole("heading", { name: "Places en revente" })).toBeVisible();
  await b.getByRole("link", { name: /Fosse · 1 place/ }).click();
  await expect(b.getByRole("heading", { name: `Cabaret ${id}` })).toBeVisible();

  // US-RSL-03 : achat de la place, nouveau billet au nom de l'acheteur
  await b.getByRole("button", { name: "Acheter cette place · Gratuit" }).click();
  await b.getByLabel("Prénom").first().fill("Tom");
  await b.getByLabel("Nom", { exact: true }).fill("Dubois");
  await b.getByLabel("Adresse e-mail").fill(`tom.${id}@exemple.be`);
  await b.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await b.waitForURL(/\/billets\/[A-Za-z0-9_-]{43}$/);
  await expect(b.getByRole("img", { name: /QR code du billet/ })).toHaveCount(1);

  // le vendeur : billet désactivé, e-mail de confirmation
  await page.goto(sellerTickets);
  await expect(page.getByText("Billet revendu : il n’est plus valable.")).toBeVisible();
  const mail = await lastEmail(sellerEmail, "resale.sold");
  expect(mail.subject).toBe(`Votre place pour Cabaret ${id} est revendue`);
  expect(
    sql(
      `select count(*) from "Ticket" t join "Event" e on e.id = t."eventId" where e.slug = 'cabaret-${id}' and t.status = 'VOID' and t."voidReason" = 'RESOLD'`,
    ),
  ).toBe("1");

  // le lien court mène à l'annonce, désormais indisponible
  await b.goto(shortUrl);
  await expect(b.getByText("Cette place n’est plus disponible.")).toBeVisible();
  await buyer.close();

  // RG-RSL-07 : le vendeur retire sa seconde annonce, le QR code revient
  await page.getByRole("button", { name: "Revendre ce billet" }).click();
  await page.getByLabel(/Prix de revente/).fill("0");
  await page.getByRole("button", { name: "Mettre en revente" }).click();
  await expect(page.getByText("En revente : transfert gratuit")).toBeVisible();
  await page.getByRole("button", { name: "Retirer l’annonce" }).click();
  await expect(page.getByRole("img", { name: /QR code du billet/ })).toHaveCount(1);

  // US-RSL-05 : suivi côté organisateur
  await page.goto(appUrl(new URL(eventUrl).pathname + "/resale"));
  await expect(page.getByText("Vendue", { exact: true })).toBeVisible();
  await expect(page.getByText("Retirée", { exact: true })).toBeVisible();
});
