import { expect, test } from "@playwright/test";
import { appUrl, organizer, sql } from "./helpers";

test("abonnement : Free, essai en cours, impayé (section 9.21)", async ({ page }) => {
  const { slug } = await organizer(page);
  await page.goto(appUrl(`/o/${slug}/billing`));
  await expect(page.getByRole("heading", { name: "Free", exact: true })).toBeVisible();
  await expect(page.getByText("295,80 €").first()).toBeVisible();
  await expect(page.getByText("−15 %")).toBeVisible();
  await expect(page.getByText("plafonnée à 0,70 €")).toBeVisible();
  await page.getByRole("button", { name: "Essayer Pro 14 jours" }).click();
  await expect(page.getByText("Le paiement de l’abonnement n’est pas encore disponible.", { exact: false })).toBeVisible();

  // essai en cours (simulé en base, comme après le webhook de Stripe)
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(`insert into "Subscription" (id, "organizationId", "planId", status, interval, "stripeCustomerId", "stripeSubscriptionId", "trialEndsAt", "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'TRIALING', 'MONTH', 'cus_${orgId}', 'sub_${orgId}', now() + interval '10 days', now() + interval '10 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'TRIALING', interval = 'MONTH', "stripeCustomerId" = 'cus_${orgId}', "stripeSubscriptionId" = 'sub_${orgId}', "trialEndsAt" = now() + interval '10 days', "currentPeriodEnd" = now() + interval '10 days'`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
  await expect(page.getByText("Essai en cours")).toBeVisible();
  await expect(page.getByText(/Essai gratuit jusqu’au .*, puis 29\s€ par mois\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Gérer mon abonnement" })).toBeVisible();
  await expect(page.getByText("Si vous résiliez, à la fin de la période payée :")).toBeVisible();

  // RG-SUB-06 : impayé, bandeau dans tout le tableau de bord
  sql(`update "Subscription" set status = 'PAST_DUE', "pastDueSince" = now() - interval '2 days' where "organizationId" = '${orgId}'`);
  await page.goto(appUrl(`/o/${slug}`));
  await expect(page.getByRole("alert").filter({ hasText: "Le paiement de votre abonnement Pro a échoué." })).toContainText("retour en Free dans 5 jours");
});
