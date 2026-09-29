import { expect, test } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { appUrl, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

const code = (secret: string, label: string) => new OTPAuth.TOTP({ issuer: "Evoly", label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate();

test("back-office : double authentification, recherche, consultation, suspension ; 2FA d'un organisateur (section 9.24, US-AUTH-06)", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  sql(`update "User" set "platformRole" = 'ADMIN' where email = 'orga${id}@exemple.be'`);

  // une autre organisation, dont l'équipe Evoly n'est pas membre
  const otherCtx = await browser.newContext({ locale: "fr-BE", extraHTTPHeaders: { "x-forwarded-for": `10.66.${Math.floor(Math.random() * 250)}.9` } });
  const other = await otherCtx.newPage();
  const b = await organizer(other);
  await publishedFreeEvent(other, b.slug, `Bal ${b.id}`, 10);
  expect((await other.goto(appUrl("/admin")))?.status()).toBe(404);

  // double authentification obligatoire : enregistrement, puis back-office
  await page.goto(appUrl("/admin"));
  await page.waitForURL(/\/compte\/securite$/);
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Code").fill(code(secret, `orga${id}@exemple.be`));
  await page.getByRole("button", { name: "Activer la double authentification" }).click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(8);
  await page.goto(appUrl("/admin"));
  await expect(page.getByRole("heading", { name: "Back-office Evoly" })).toBeVisible();

  // recherche, fiche, consultation en lecture seule (journalisée)
  await page.getByLabel("Rechercher").fill(`Orga ${b.id}`);
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.getByRole("link", { name: `Orga ${b.id}` }).first().click();
  await page.getByRole("button", { name: /Consulter l’app en lecture seule/ }).click();
  await page.waitForURL(new RegExp(`/o/${b.slug}$`));
  await expect(page.getByText("Consultation support Evoly en lecture seule", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Quitter la consultation" }).click();
  await page.waitForURL(/\/admin$/);
  expect(sql(`select count(*) from "AuditLog" where action = 'platform.support_view_started' and "organizationId" = (select id from "Organization" where slug = '${b.slug}')`)).toBe("1");

  // suspension : page publique fermée, puis réactivation
  const orgB = sql(`select id from "Organization" where slug = '${b.slug}'`);
  await page.goto(appUrl(`/admin/organisations/${orgB}`));
  await page.getByLabel("Motif de la suspension").fill("Vérification d’identité en cours");
  await page.getByRole("button", { name: "Suspendre l’organisation" }).click();
  await expect(page.getByText("SUSPENDED", { exact: true })).toBeVisible();
  expect((await page.goto(siteUrl(b.slug, `/bal-${b.id}`)))?.status()).toBe(404);
  await page.goto(appUrl(`/admin/organisations/${orgB}`));
  await page.getByRole("button", { name: "Réactiver l’organisation" }).click();
  await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
  expect((await page.goto(siteUrl(b.slug, `/bal-${b.id}`)))?.status()).toBe(200);

  // US-AUTH-06 : l'organisateur active sa double authentification, puis se reconnecte avec un code de secours
  await other.goto(appUrl("/compte/securite"));
  const secretB = (await other.getByTestId("totp-secret").textContent())!.trim();
  await other.getByLabel("Code").fill(code(secretB, `orga${b.id}@exemple.be`));
  await other.getByRole("button", { name: "Activer la double authentification" }).click();
  const recovery = (await other.getByTestId("recovery-codes").locator("li").first().textContent())!.trim();
  const fresh = await browser.newContext({ locale: "fr-BE", extraHTTPHeaders: { "x-forwarded-for": `10.65.${Math.floor(Math.random() * 250)}.8` } });
  const again = await fresh.newPage();
  await again.goto(appUrl("/login"));
  await again.getByLabel("Adresse e-mail").fill(`orga${b.id}@exemple.be`);
  await again.getByLabel("Mot de passe").fill("Motdepasse-2026!");
  await again.getByRole("button", { name: "Se connecter" }).click();
  // la connexion aboutit sur la demande de code (le mot de passe seul ne donne accès à rien)
  await again.waitForURL(/\/2fa/);
  await again.getByLabel("Code").fill(recovery);
  await again.getByRole("button", { name: "Valider" }).click();
  await again.waitForURL((u) => !u.pathname.startsWith("/2fa")); // validation enregistrée avant de naviguer
  await again.goto(appUrl(`/o/${b.slug}`));
  await expect(again).toHaveURL(new RegExp(`/o/${b.slug}$`)); // session validée : plus de demande de code
  await Promise.all([otherCtx.close(), fresh.close()]);
});
