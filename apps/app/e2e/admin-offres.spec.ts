import { expect, test } from "./fixtures";
import * as OTPAuth from "otpauth";
import { appUrl, organizer, sql } from "./helpers";

const code = (secret: string, label: string) =>
  new OTPAuth.TOTP({ issuer: "Evoly", label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate();

test("back-office : offre Partenaire d'une organisation abonnée chez Stripe (message, pas de plantage), jours Pro offerts toujours là après rechargement (RG-ADM-02)", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(`update "User" set "platformRole" = 'ADMIN' where email = 'orga${id}@exemple.be'`);
  await page.goto(appUrl("/admin"));
  await page.waitForURL(/\/compte\/securite$/);
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Code").fill(code(secret, `orga${id}@exemple.be`));
  await page.getByRole("button", { name: "Activer la double authentification" }).click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(8);

  // abonnement payant en cours chez Stripe : l'attribution d'une offre est refusée avec un message, sans plantage
  sql(
    `update "Subscription" set "planId" = 'pro', status = 'ACTIVE', "stripeSubscriptionId" = 'sub_e2e_${id}', "stripeCustomerId" = 'cus_e2e_${id}' where "organizationId" = '${orgId}'`,
  );
  await page.goto(appUrl(`/admin/organisations/${orgId}`));
  await page.getByLabel("Offre attribuée").selectOption("partner");
  await page.getByRole("button", { name: "Attribuer l’offre" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "abonnement Stripe en cours" })).toBeVisible(); // et non la page d'erreur
  await expect(page.getByLabel("Résilier l’abonnement Stripe en cours")).toBeVisible();
  expect(sql(`select "planId" from "Subscription" where "organizationId" = '${orgId}'`)).toBe("pro");

  // sans abonnement Stripe : les jours Pro offerts restent après rechargement
  sql(
    `update "Subscription" set "planId" = 'free', status = 'NONE', "stripeSubscriptionId" = null, "stripeCustomerId" = null, "trialEndsAt" = null, "currentPeriodEnd" = null where "organizationId" = '${orgId}'`,
  );
  await page.goto(appUrl(`/admin/organisations/${orgId}`));
  await page.getByLabel("Jours d’essai").fill("14");
  await page.getByRole("button", { name: "Prolonger l’essai Pro" }).click();
  await expect(page.getByText(/pro · TRIALING · essai jusqu’au/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/pro · TRIALING · essai jusqu’au/)).toBeVisible();
});
