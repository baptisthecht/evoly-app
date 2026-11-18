import { expect, test } from "./fixtures";
import { appUrl, organizer, sql } from "./helpers";

// Passage à Mollie, lot 2 (docs/MOLLIE.md) : relier son compte Mollie depuis Paramètres, Encaissement. Mollie est absent
// des parcours : l'application Connect est factice, la page d'autorisation interceptée, l'état du compte simulé en base.
test("compte Mollie : téléphone exigé, départ vers l'autorisation de Mollie, puis l'état du compte (à compléter, prêt)", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  await page.goto(appUrl(`/o/${slug}/settings/payments`));
  await expect(page.getByText("Non relié", { exact: true })).toBeVisible();
  await expect(page.getByText(/fournis par Mollie B\.V\./)).toBeVisible();

  // téléphone illisible : refusé avant de partir chez Mollie
  const phone = page.getByLabel("Téléphone de l’organisation");
  await phone.fill("appelez-moi");
  await page.getByRole("button", { name: "Créer mon compte Mollie" }).click();
  await expect(page.getByText(/Numéro illisible/)).toBeVisible();

  // compte Mollie existant : page d'autorisation de Mollie, téléphone gardé au format international
  await page.route("https://my.mollie.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<h1>Mollie</h1>",
    }),
  );
  await phone.fill("0470 12 34 56");
  await page
    .getByRole("button", { name: "J’ai déjà un compte Mollie" })
    .click();
  await page.waitForURL(/^https:\/\/my\.mollie\.com\/oauth2\/authorize/);
  const authorize = new URL(page.url()).searchParams;
  expect(authorize.get("client_id")).toBe("app_e2e_evoly");
  expect(authorize.get("landing_page")).toBe("login");
  expect(authorize.get("redirect_uri")).toBe(
    "http://localhost:3001/api/mollie/oauth",
  );
  expect(authorize.get("scope")).toContain("payments.write");
  expect(authorize.get("state")).toBeTruthy();
  expect(sql(`select phone from "Organization" where id = '${orgId}'`)).toBe(
    "+32470123456",
  );

  // compte relié, inscription à compléter chez Mollie (relu il y a moins d'une minute : pas de nouvel appel à Mollie)
  sql(
    `insert into "MollieAccount" (id, "organizationId", "mollieOrganizationId", "refreshToken", methods, scopes, "onboardingStatus", "onboardingUrl", "profileId", "profileStatus", "syncedAt", "updatedAt") values ('ma${id}', '${orgId}', 'org_e2e_${id}', 'chiffre', '{}', '{}', 'NEEDS_DATA', 'https://my.mollie.com/dashboard/org_e2e/onboarding', 'pfl_${id}', 'unverified', now(), now())`,
  );
  await page.goto(appUrl(`/o/${slug}/settings/payments`));
  await expect(
    page.getByText("Informations à donner", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Compléter chez Mollie" }),
  ).toHaveAttribute(
    "href",
    "https://my.mollie.com/dashboard/org_e2e/onboarding",
  );
  await expect(
    page.getByText("Aucun moyen de paiement actif pour l’instant."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Déconnecter" })).toBeVisible();

  // compte prêt : moyens de paiement et virements activés
  sql(
    `update "MollieAccount" set "onboardingStatus" = 'COMPLETED', "canReceivePayments" = true, "canReceiveSettlements" = true, "profileStatus" = 'verified', methods = '{bancontact,creditcard,applepay}', "syncedAt" = now() where id = 'ma${id}'`,
  );
  await page.reload();
  await expect(page.getByText("Prêt", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Moyens de paiement : Bancontact, cartes, Apple Pay"),
  ).toBeVisible();
  await expect(
    page.getByText("Virements vers votre banque : activés"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Compléter chez Mollie" }),
  ).toHaveCount(0);

  // retour de Mollie avec une erreur : message affiché
  await page.goto(
    appUrl(`/o/${slug}/settings/payments?mollie=MOLLIE_ACCOUNT_IN_USE`),
  );
  await expect(
    page.getByText(
      "Ce compte Mollie est déjà relié à une autre organisation sur Evoly.",
    ),
  ).toBeVisible();
});
