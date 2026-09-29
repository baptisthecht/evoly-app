import { expect, test } from "@playwright/test";
import { appUrl, organizer, siteUrl } from "./helpers";

test("paramètres de l'organisation, puis suppression avec double confirmation (section 9.3)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await page.goto(appUrl(`/o/${slug}/settings`));
  await page.getByLabel("Raison sociale").fill(`Orga ${id} ASBL`);
  await page.getByLabel("E-mail de contact").fill(`contact.${id}@exemple.be`);
  await page.getByLabel("Numéro de TVA").fill("0123 456 789");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Numéro de TVA")).toHaveValue("BE0123456789");
  await expect(page.getByLabel("Raison sociale")).toHaveValue(`Orga ${id} ASBL`);

  // RG-ORG-06 : double confirmation
  await page.getByLabel("Je comprends que la suppression est définitive", { exact: false }).check();
  await page.getByLabel(/Pour confirmer, saisissez le nom/).fill("mauvais nom");
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByText("Le nom saisi ne correspond pas à celui de l’organisation.")).toBeVisible();
  await page.getByLabel(/Pour confirmer, saisissez le nom/).fill(`Orga ${id}`);
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await page.waitForURL(/\/onboarding/);
  expect((await page.goto(siteUrl(slug)))?.status()).toBe(404);
  expect((await page.goto(appUrl(`/o/${slug}`)))?.status()).toBe(404);
});
