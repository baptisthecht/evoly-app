import { expect, test } from "./fixtures";
import { appUrl, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("alerte « Prévenez-moi » : inscription avant l'ouverture des ventes, puis suppression sans connexion depuis sa page", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Festival ${id}`, 10);
  const eventId = eventUrl.split("/").pop()!;
  sql(`update "Event" set "salesStartAt" = now() + interval '2 days' where id = '${eventId}'`); // ventes pas encore ouvertes
  const eventSlug = sql(`select slug from "Event" where id = '${eventId}'`);
  await page.goto(siteUrl(slug, `/${eventSlug}`));
  const email = `fan${id}@exemple.be`;
  await page.getByLabel("Votre adresse e-mail").fill(email);
  await page.getByRole("button", { name: "M’avertir" }).click();
  await expect(page.getByText("C’est noté : nous vous écrirons dès l’ouverture des ventes.")).toBeVisible();

  const token = sql(`select token from "EventAlert" where email = '${email}'`);
  await page.goto(appUrl(`/alerte/${token}`));
  await page.getByRole("button", { name: "Supprimer mon alerte" }).click();
  await expect(page.getByText("Votre alerte est supprimée.")).toBeVisible();
});

test("préférences de notification : une case modifiée garde son nouvel état après enregistrement (section 9.20)", async ({ page }) => {
  const { slug } = await organizer(page);
  await page.goto(appUrl(`/o/${slug}/notifications/preferences`));
  await expect(page.getByRole("heading", { name: "Préférences de notification" })).toBeVisible();
  const box = page.getByRole("checkbox").first();
  const before = await box.isChecked();
  await box.click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Préférences enregistrées.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked({ checked: !before });
});
