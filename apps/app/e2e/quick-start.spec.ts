import { expect, test } from "./fixtures";
import { appUrl, sql, uid } from "./helpers";
import { firstLink, lastEmail } from "./outbox";

// création rapide (/start) de bout en bout : le tunnel des visiteurs des annonces et du site vitrine
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

test("création rapide : événement, compte, rappel de l'événement, vérification de l'adresse, puis l'événement en brouillon", async ({
  page,
}) => {
  const id = uid();
  const email = `start${id}@exemple.be`;
  const title = `Soirée de rentrée ${id}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip() });
  await page.goto(appUrl("/start"));

  // étape 1 : l'événement
  await page.locator("#qs-title").fill(title);
  await page
    .locator("#qs-date")
    .fill(new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10));
  await page.locator("#qs-time").fill("20:00");
  await page.locator("#qs-place").fill("La Madeleine");
  await page.keyboard.press("Escape"); // ferme les suggestions d'adresses, s'il y en a
  await page.locator("#qs-city").fill("Bruxelles");
  await page.getByRole("button", { name: "Continuer" }).click();

  // étape 2 : le compte
  await page.locator("#qs-org").fill(`Club ${id}`);
  await page.locator("#qs-email").fill(email);
  await page.locator("#qs-password").fill("Motdepasse-2026!");
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: "Créer ma billetterie" }).click();

  // vérification de l'adresse : l'événement enregistré, en attente de publication
  await page.waitForURL(/\/verify-email/);
  const notice = page.getByRole("region", {
    name: "Votre événement est enregistré",
  });
  await expect(notice).toContainText(title);
  await expect(notice).toContainText("20:00");
  await expect(notice).toContainText("La Madeleine, Bruxelles");

  // lien de l'e-mail : directement dans l'application (l'organisation existe déjà)
  await page.goto(
    firstLink((await lastEmail(email, "account.verify_email")).text),
  );
  await page.waitForURL(
    (u) => !/^\/(verify-email|login|register)/.test(u.pathname),
  );
  const slug = sql(
    `select o.slug from "Organization" o join "OrganizationMember" m on m."organizationId" = o.id join "User" u on u.id = m."userId" where u.email = '${email}'`,
  );
  expect(slug).not.toBe("");
  await page.goto(appUrl(`/o/${slug}/events`));
  await expect(page.getByText(title)).toBeVisible();
  await expect(
    page.getByText("Brouillon", { exact: true }).first(),
  ).toBeVisible();
});
