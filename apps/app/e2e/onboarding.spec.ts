import { expect, test, type Page } from "@playwright/test";
import { createOrganization, signUpAndVerify, uid } from "./helpers";
import { firstLink, lastEmail } from "./outbox";

const run = uid;

test("inscription, confirmation, onboarding et tableau de bord", async ({ page }) => {
  const id = run();
  const email = `orga${id}@exemple.be`;
  const slug = `soirees-${id}`;
  await signUpAndVerify(page, email, "Motdepasse-2026!");
  await createOrganization(page, `Soirées ${id}`, slug);
  await page.getByRole("link", { name: "Plus tard" }).click();
  await page.waitForURL(`/o/${slug}`);
  await expect(page.getByText("Connectez Stripe pour vendre des billets payants")).toBeVisible();
  await expect(page.getByText("Votre premier événement vous attend.")).toBeVisible();
  expect((await page.goto("/o/organisation-inexistante"))?.status()).toBe(404);
});

test("adresse réservée et conditions obligatoires", async ({ page }) => {
  const id = run();
  await signUpAndVerify(page, `orga${id}@exemple.be`, "Motdepasse-2026!");
  await page.getByLabel("Nom de l’organisation").fill(`Asso ${id}`);
  await page.locator("#subdomain").fill("scanner");
  await expect(page.getByText("Cette adresse est réservée.")).toBeVisible();
  await page.locator("#subdomain").fill(`asso-${id}`);
  await expect(page.getByText("Cette adresse est disponible.")).toBeVisible();
  await page.getByRole("button", { name: "Créer mon organisation" }).click();
  await expect(page.getByText("Acceptez les conditions pour continuer.")).toBeVisible();
});

test("connexion bloquée après 5 échecs (RG-AUTH-05)", async ({ page }) => {
  const id = run();
  const email = `orga${id}@exemple.be`;
  await signUpAndVerify(page, email, "Motdepasse-2026!");
  await page.context().clearCookies();
  await page.goto("/login");
  const attempt = async (password: string) => {
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe").fill(password);
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/login")), page.getByRole("button", { name: "Se connecter" }).click()]);
  };
  for (let i = 0; i < 5; i++) {
    await attempt("mauvais-mot-de-passe");
    await expect(page.getByText("Adresse ou mot de passe incorrect.")).toBeVisible();
  }
  await attempt("Motdepasse-2026!");
  await expect(page.getByText("Trop de tentatives. Réessayez dans quelques minutes.")).toBeVisible();
});

test("mot de passe oublié : même réponse, lien à usage unique", async ({ page }) => {
  const id = run();
  const email = `orga${id}@exemple.be`;
  await signUpAndVerify(page, email, "Motdepasse-2026!");
  await page.context().clearCookies();
  await page.goto("/forgot-password");
  await page.getByLabel("Adresse e-mail").fill(`inconnu${id}@exemple.be`);
  await page.getByRole("button", { name: "Recevoir un lien" }).click();
  await expect(page.getByText("Si un compte existe pour cette adresse")).toBeVisible();
  await page.goto("/forgot-password");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un lien" }).click();
  await expect(page.getByText("Si un compte existe pour cette adresse")).toBeVisible();
  const link = firstLink((await lastEmail(email, "account.reset_password")).text);
  await page.goto(link);
  await page.getByLabel("Nouveau mot de passe").fill("Nouveau-mot-2026!");
  await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
  await page.waitForURL(/\/login\?reset=1/);
  await page.goto(link);
  if (await page.getByLabel("Nouveau mot de passe").count()) {
    await page.getByLabel("Nouveau mot de passe").fill("Encore-un-autre-2026");
    await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
  }
  await expect(page.getByText("n’est plus valable")).toBeVisible();
});

test("menu du tableau de bord sur téléphone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "vérification propre au téléphone");
  const id = run();
  const slug = `mobile-${id}`;
  await signUpAndVerify(page, `orga${id}@exemple.be`, "Motdepasse-2026!");
  await createOrganization(page, `Mobile ${id}`, slug);
  await page.goto(`/o/${slug}`);
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.locator("#mobile-nav").getByRole("link", { name: "Événements" })).toBeVisible();
  await page.locator("#mobile-nav").getByRole("link", { name: "Paramètres" }).click();
  await page.waitForURL(`/o/${slug}/settings`);
  await expect(page.locator("#mobile-nav")).toHaveCount(0);
});
