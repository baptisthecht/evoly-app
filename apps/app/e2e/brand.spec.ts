import { expect, test } from "@playwright/test";
import { appUrl, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBmgAhgYAAAAAP//AwBfDQX/AAAAAElFTkSuQmCC", "base64");

test("marque, sous-domaine d'événement, changement d'adresse et domaine personnalisé (section 9.19)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Soirée ${id}`, 20);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );

  // US-BRD-01 : logo et couleurs, mention Evoly retirée (US-BRD-02)
  await page.goto(appUrl(`/o/${slug}/brand`));
  await page.getByTestId("logo-input").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Logo de l’organisation" })).toBeVisible();
  await page.getByLabel("Couleur principale", { exact: true }).last().fill("#1B4D8C");
  await page.getByRole("button", { name: "Enregistrer la marque" }).click();
  await expect(page.getByText("Marque enregistrée.")).toBeVisible();
  await page.goto(siteUrl(slug, `/soiree-${id}`));
  await expect(page.locator("header img").first()).toBeVisible();
  await expect(page.getByText("Billetterie propulsée par Evoly")).toHaveCount(0);
  expect(await page.locator("article > header").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(27, 77, 140)");

  // US-BRD-05 : sous-domaine dédié à l'événement
  await page.goto(`${eventUrl}/settings`);
  await page.getByLabel("Sous-domaine de l’événement").fill(`soir-${id}`);
  await expect(page.getByText("Cette adresse est disponible.")).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer le sous-domaine" }).click();
  await expect(page.getByText("Adresse active", { exact: false })).toBeVisible();
  await page.goto(siteUrl(`soir-${id}`));
  await expect(page.getByRole("heading", { name: `Soirée ${id}` })).toBeVisible();

  // RG-SDM-03 : l'ancienne adresse de l'organisation redirige vers la nouvelle
  await page.goto(appUrl(`/o/${slug}/brand`));
  await page.getByLabel("Sous-domaine", { exact: true }).fill(`neuf-${id}`);
  await expect(page.getByText(`L’ancienne adresse orga-${id}.localhost:3001 redirigera`, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Changer d’adresse" }).click();
  await expect(page.getByText("Adresse modifiée.")).toBeVisible();
  await page.goto(siteUrl(slug, `/soiree-${id}`));
  await expect(page).toHaveURL(siteUrl(`neuf-${id}`, `/soiree-${id}`));

  // US-BRD-04 : domaine personnalisé (DNS vérifié ici directement en base)
  await page.goto(appUrl(`/o/${slug}/brand`));
  await page.getByLabel("Domaine", { exact: true }).fill(`billetterie-${id}.test`);
  await page.getByRole("button", { name: "Ajouter le domaine" }).click();
  await expect(page.getByText("En attente du DNS")).toBeVisible();
  await expect(page.getByText("domains.localhost").first()).toBeVisible();
  sql(`update "CustomDomain" set status = 'ACTIVE', "verifiedAt" = now() where domain = 'billetterie-${id}.test'`);
  await page.goto(`http://billetterie-${id}.test:3001/`);
  await expect(page.getByText(`Soirée ${id}`)).toBeVisible();
  await page.goto(`http://billetterie-${id}.test:3001/soiree-${id}`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `http://billetterie-${id}.test:3001/soiree-${id}`);

  // RG-CDM-04 et RG-DOM-05 : en Free, domaine désactivé, page d'erreur avec lien vers l'adresse par défaut
  sql(`update "Subscription" set status = 'CANCELED', "currentPeriodEnd" = now() - interval '1 day' where "organizationId" = '${orgId}'`);
  await page.goto(`http://billetterie-${id}.test:3001/`);
  await expect(page.getByRole("heading", { name: "Cette adresse n’est pas active" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aller à la billetterie de l’organisation" })).toHaveAttribute("href", siteUrl(`neuf-${id}`));
  await page.goto(siteUrl(`soir-${id}`));
  await expect(page).toHaveURL(siteUrl(`neuf-${id}`, `/soiree-${id}`));
});
