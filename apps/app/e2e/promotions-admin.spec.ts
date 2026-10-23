import * as OTPAuth from "otpauth";
import { expect, test } from "./fixtures";
import { appUrl, organizer, sql, uid } from "./helpers";
import { firstLink, lastEmail } from "./outbox";

// offres commerciales (docs/OFFRES.md) de bout en bout : créées dans l'administration, accordées par le lien de la campagne
const totp = (secret: string, label: string) =>
  new OTPAuth.TOTP({
    issuer: "Evoly",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate();
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
test.beforeEach(({}, testInfo) =>
  test.skip(testInfo.project.name !== "desktop", "un seul format suffit"),
);

test("offre commerciale : créée dans l'administration, puis accordée à l'organisation venue par le lien de la campagne", async ({
  page,
  browser,
}) => {
  // administrateur d'Evoly : double authentification exigée
  const { id } = await organizer(page);
  sql(
    `update "User" set "platformRole" = 'ADMIN' where email = 'orga${id}@exemple.be'`,
  );
  await page.goto(appUrl("/admin/offres"));
  await page.waitForURL(/\/compte\/securite$/);
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Code").fill(totp(secret, `orga${id}@exemple.be`));
  await page
    .getByRole("button", { name: "Activer la double authentification" })
    .click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(8);

  // création : 2 mois de Pro, seulement par le lien de la campagne, prioritaire sur l'offre de lancement
  const code = `essai-${id}`;
  await page.goto(appUrl("/admin/offres/nouvelle"));
  await page.locator("#p-code").fill(code);
  await page.locator("#p-name").fill(`Essai ${id}`);
  await page.locator('input[name="active"]').check(); // une nouvelle offre est inactive par défaut
  await page.locator("#p-duration").fill("2");
  await page.locator("#p-unit").selectOption("MONTH");
  await page.locator("#p-priority").fill("100"); // priorité maximale (bornée à 100)
  await page.locator("#p-audience").selectOption("LINK");
  await page.locator("#p-fr-banner").fill(`2 mois de Pro offerts ${id}`);
  await page.locator("#p-fr-short").fill("2 mois offerts");
  await page.locator("#p-fr-cta").fill("Profiter de l’offre");
  await page.getByRole("button", { name: "Enregistrer l’offre" }).click();
  await page.waitForURL(/\/admin\/offres$/);
  await expect(page.getByRole("row", { name: new RegExp(code) })).toBeVisible();

  // un visiteur arrive par le lien de la campagne et crée sa billetterie
  const visitor = await (
    await browser.newContext({ locale: "fr-BE" })
  ).newPage(); // comme les autres navigateurs des parcours
  await visitor.setExtraHTTPHeaders({ "x-forwarded-for": ip() });
  await visitor.goto(appUrl(`/start?offre=${code}`));
  const n = uid();
  const email = `offre${n}@exemple.be`;
  await visitor.locator("#qs-title").fill(`Gala ${n}`);
  await visitor
    .locator("#qs-date")
    .fill(new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10));
  await visitor.locator("#qs-time").fill("20:00");
  await visitor.locator("#qs-place").fill("Salle des fêtes");
  await visitor.keyboard.press("Escape");
  await visitor.locator("#qs-city").fill("Namur");
  await visitor.getByRole("button", { name: "Continuer" }).click();
  await expect(visitor.getByText(`2 mois de Pro offerts ${id}`)).toBeVisible(); // l'offre de la campagne, à l'étape du compte
  await visitor.locator("#qs-org").fill(`Club ${n}`);
  await visitor.locator("#qs-email").fill(email);
  await visitor.locator("#qs-password").fill("Motdepasse-2026!");
  await visitor.locator('input[name="terms"]').check();
  await visitor.getByRole("button", { name: "Créer ma billetterie" }).click();
  await visitor.waitForURL(/\/verify-email/);
  await visitor.goto(
    firstLink((await lastEmail(email, "account.verify_email")).text),
  );
  await visitor.waitForURL(
    (u) => !/^\/(verify-email|login|register)/.test(u.pathname),
  );

  // l'organisation a reçu l'offre de la campagne : Pro, et l'attribution comptée dans l'administration
  const orgId = sql(
    `select o.id from "Organization" o join "OrganizationMember" m on m."organizationId" = o.id join "User" u on u.id = m."userId" where u.email = '${email}'`,
  );
  expect(
    sql(
      `select "planId" from "Subscription" where "organizationId" = '${orgId}'`,
    ),
  ).toBe("pro");
  expect(
    sql(
      `select p.code from "PromotionRedemption" r join "Promotion" p on p.id = r."promotionId" where r."organizationId" = '${orgId}'`,
    ),
  ).toBe(code);
  await page.goto(appUrl("/admin/offres"));
  await expect(
    page
      .getByRole("row", { name: new RegExp(code) })
      .getByRole("cell")
      .nth(3),
  ).toHaveText(/^\s*1\b/);
});
