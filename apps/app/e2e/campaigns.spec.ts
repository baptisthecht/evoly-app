import { expect, test } from "@playwright/test";
import { lastEmail } from "./outbox";
import { appUrl, buyFree, cronSecret, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("campagne : modèle, destinataires, aperçu, test, envoi et statistiques (US-MKT-03)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const ownerEmail = `orga${id}@exemple.be`;
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
  await publishedFreeEvent(page, slug, `Festival ${id}`, 30);
  const buyer = `lea.${id}@exemple.be`;
  await buyFree(page, siteUrl(slug, `/festival-${id}`), "Fosse", 1, buyer);
  sql(`update "Contact" set "marketingConsent" = true, "consentAt" = now(), "consentSource" = 'CHECKOUT' where "organizationId" = '${orgId}'`);

  await page.goto(appUrl(`/o/${slug}/marketing?tab=campaigns`));
  await page.getByRole("link", { name: "Nouvelle campagne" }).click();
  await expect(page.getByTestId("audience-count")).toHaveText("1 destinataire");
  await expect(page.getByLabel("Objet")).toHaveValue("{{prenom}}, une nouvelle date vous attend");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForURL(/\/marketing\/campaigns\/c[a-z0-9]{20,}$/);

  await page.getByRole("button", { name: "Aperçu" }).click();
  await expect(page.frameLocator('iframe[title="Aperçu"]').getByText("Une nouvelle date vous attend")).toBeVisible();
  await expect(page.frameLocator('iframe[title="Aperçu"]').getByText(`Festival ${id}`)).toBeVisible();
  await page.getByRole("button", { name: /Envoyer un test à/ }).click();
  await expect(page.getByText(`Test envoyé à ${ownerEmail}.`)).toBeVisible();
  expect((await lastEmail(ownerEmail, "campaign.test")).subject).toMatch(/^\[Test\] /);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Envoyer maintenant" }).click();
  await expect(page.getByText("Programmée", { exact: true })).toBeVisible();
  // la tâche traite toutes les campagnes dues de la plateforme (les parcours tournent en parallèle) : on vérifie l'effet, pas le décompte
  const cron = await page.request.get(appUrl("/api/cron/campaigns"), { headers: { authorization: `Bearer ${cronSecret()}` } });
  expect(cron.status()).toBe(200);
  await page.reload();
  await expect(page.getByText("Envoyée", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Statistiques" })).toContainText("Destinataires1");

  const mail = await lastEmail(buyer, "campaign");
  expect(mail.subject).toBe("Léa, une nouvelle date vous attend");
  expect(mail.text).toContain("Se désinscrire : http");
});
