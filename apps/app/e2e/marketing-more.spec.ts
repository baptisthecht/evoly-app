import { expect, test } from "@playwright/test";
import { appUrl, organizer, publishedFreeEvent, sql } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBmgAhgYAAAAAP//AwBfDQX/AAAAAElFTkSuQmCC", "base64");

test("remerciement après l'événement, image importée et modèle personnel réutilisé (section 9.18)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
  const eventUrl = await publishedFreeEvent(page, slug, `Salon ${id}`, 30);

  // US-MKT-02 : remerciement activé, objet personnalisé
  await page.goto(`${eventUrl}/settings`);
  const card = page.getByRole("heading", { name: "E-mails marketing de l’événement" }).locator("xpath=..");
  await card.getByLabel("Activer : Remerciement après l’événement").check();
  await card.getByLabel("Objet").first().fill(`Merci d’être venu·e au Salon ${id}`);
  await card.getByRole("button", { name: "Enregistrer" }).first().click();
  await expect(card.getByText("Enregistré.")).toBeVisible();
  expect(
    sql(
      `select enabled || '|' || subject from "EmailAutomation" where "eventId" = (select id from "Event" where "organizationId" = '${orgId}') and type = 'POST_EVENT'`,
    ),
  ).toBe(`true|Merci d’être venu·e au Salon ${id}`);

  // image importée dans une campagne, puis modèle personnel réutilisé
  await page.goto(appUrl(`/o/${slug}/marketing/campaigns/new?template=blank`));
  await page.getByRole("button", { name: "+ Image" }).click();
  await page.getByTestId("image-input-2").setInputFiles({ name: "affiche.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByLabel("Adresse de l’image (https)")).toHaveValue(/\/files\/orgs\/.+\/campaign-[a-z0-9]+\.png$/);
  await page.getByLabel("Nom de la campagne").fill(`Modèle salon ${id}`);
  await page.getByRole("button", { name: "Enregistrer comme modèle" }).click();
  await expect(page.getByText("Modèle enregistré", { exact: false })).toBeVisible();
  await page.goto(appUrl(`/o/${slug}/marketing/campaigns/new`));
  await page.getByRole("link", { name: `★ Modèle salon ${id}` }).click();
  await expect(page.getByLabel("Nom de la campagne")).toHaveValue(`Modèle salon ${id}`);
  await expect(page.getByLabel("Adresse de l’image (https)")).toHaveValue(/campaign-[a-z0-9]+\.png$/);
});
