import { expect, test } from "@playwright/test";
import { firstLink, lastEmail } from "./outbox";
import { appUrl, organizer, siteUrl, sql } from "./helpers";

// adresse IP propre à ce test : la recherche de billets est limitée par adresse, partagée sinon par toute la suite
test.use({ extraHTTPHeaders: { "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` } });

test("code de gratuité sur un billet payant nominatif, titulaire modifiable, PDF, retrouver mes billets", async ({ page }) => {
  const { id, slug } = await organizer(page);
  // compte Stripe actif simulé : un tarif payant peut être publié
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(`insert into "StripeAccount" (id, "organizationId", "stripeAccountId", country, "defaultCurrency", status, "chargesEnabled", "payoutsEnabled", "detailsSubmitted", "updatedAt") values ('sa_${id}', '${orgId}', 'acct_test_${id}', 'BE', 'EUR', 'ACTIVE', true, true, true, now())`);

  await page.goto(appUrl(`/o/${slug}/events/new`));
  await page.getByLabel("Titre").fill(`Gala ${id}`);
  await page.getByLabel("Nom du lieu").fill("Flagey");
  await page.getByLabel("Nom du tarif").fill("VIP");
  await page.getByLabel(/^Prix/).fill("45");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(/\/events\/c[a-z0-9]{20,}$/);
  const eventUrl = page.url();

  // tarif nominatif
  await page.goto(`${eventUrl}/tickets`);
  await page.getByRole("button", { name: "Modifier" }).click();
  await page.getByText("Plus d’options").click();
  await page.getByLabel(/nominatif/i).check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Modifier" })).toBeVisible();

  // code de gratuité (RG-PRM-05)
  await page.goto(`${eventUrl}/promo`);
  await page.getByRole("button", { name: "+ Nouveau code" }).click();
  await page.getByLabel("Code", { exact: true }).fill("invite");
  await page.getByLabel("Réduction").selectOption("FREE");
  await page.getByRole("button", { name: "Créer le code" }).click();
  await expect(page.getByText("INVITE", { exact: true })).toBeVisible();

  await page.goto(eventUrl);
  await page.getByRole("button", { name: "Publier" }).click();
  await expect(page.getByText("Liens à partager")).toBeVisible();

  // achat avec le code : billet payant rendu gratuit
  await page.goto(siteUrl(slug, `/gala-${id}`));
  const box = page.locator("#billets");
  await box.getByRole("button", { name: "Un billet VIP de plus" }).click();
  await box.getByRole("button", { name: "J’ai un code promo" }).click();
  await box.getByLabel("Code promo").fill("mauvais");
  await box.getByRole("button", { name: "Appliquer" }).click();
  await expect(box.getByText("Ce code n’existe pas pour cet événement.")).toBeVisible();
  await box.getByLabel("Code promo").fill("invite");
  await box.getByRole("button", { name: "Appliquer" }).click();
  await expect(box.getByText("Code INVITE appliqué")).toBeVisible();
  await box.getByRole("button", { name: "Continuer" }).click();
  await expect(box.getByText("Code INVITE", { exact: true })).toBeVisible();

  const email = `invite.${id}@exemple.be`;
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(email);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await expect(box.getByText("Indiquez le prénom et le nom de chaque titulaire.")).toBeVisible();
  await box.getByRole("button", { name: "C’est moi" }).click();
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();

  await page.waitForURL(/\/billets\/[A-Za-z0-9_-]{43}$/);
  const ticketsUrl = page.url();
  await expect(page.getByText("Léa Martin")).toBeVisible();

  // RG-QST-02 : titulaire modifiable jusqu'au début de l'événement
  await page.getByRole("button", { name: "Modifier le titulaire" }).click();
  await page.getByLabel("Prénom").fill("Zoé");
  await page.getByLabel("Nom", { exact: true }).fill("Leroy");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Zoé Leroy")).toBeVisible();

  // PDF téléchargeable, et joint à l'e-mail avec le fichier calendrier
  const pdf = await page.evaluate(async (url) => {
    const r = await fetch(url);
    const bytes = new Uint8Array(await r.arrayBuffer());
    return { type: r.headers.get("content-type"), head: String.fromCharCode(...bytes.slice(0, 5)) };
  }, `${ticketsUrl}/billets.pdf`);
  expect(pdf).toEqual({ type: "application/pdf", head: "%PDF-" });
  const mail = await lastEmail(email, "order.confirmation");
  expect(mail.attachments?.map((a) => a.filename.split(".").pop()).sort()).toEqual(["ics", "pdf"]);

  // US-POST-02 : retrouver ses billets par e-mail
  await page.goto(siteUrl(slug, `/gala-${id}`));
  await page.getByRole("link", { name: /Retrouver mes billets/ }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir mes liens" }).click();
  await expect(page.getByText("C’est envoyé.", { exact: false })).toBeVisible();
  expect(firstLink((await lastEmail(email, "order.lookup")).text)).toBe(ticketsUrl);

  // RG-PRM-03 : compteur d'utilisations
  await page.goto(`${eventUrl}/promo`);
  await expect(page.getByText("1 utilisation")).toBeVisible();
});
