import { expect, test } from "@playwright/test";
import { lastEmail } from "./outbox";
import { appUrl, organizer, publishedFreeEvent } from "./helpers";

test("billets offerts depuis l'onglet Billets, commandes « Offert », export des participants (US-ORD-03, US-STAT-03)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Vernissage ${id}`, 30);
  await page.goto(`${eventUrl}/tickets`);
  await page.getByLabel("Invités").fill(`Léa Martin <lea.${id}@exemple.be>\ntom.${id}@exemple.be\npas-une-adresse`);
  await page.getByLabel("Billets par invité").fill("2");
  await page.getByRole("button", { name: "Envoyer les billets" }).click();
  await expect(page.getByText("Billets envoyés à 2 invités.")).toBeVisible();
  await expect(page.getByText("Ligne 3 ignorée", { exact: false })).toBeVisible();
  expect((await lastEmail(`lea.${id}@exemple.be`, "order.confirmation")).subject).toContain(`Vernissage ${id}`);

  await page.goto(appUrl(`/o/${slug}/orders`));
  await expect(page.getByText("Offert", { exact: true })).toHaveCount(2);
  const csv = await page.request.get(`${eventUrl}/participants`);
  const text = await csv.text();
  expect(text).toContain(`lea.${id}@exemple.be`);
  expect(text.split("\n").filter((l) => l.includes(`tom.${id}@exemple.be`))).toHaveLength(2);
});
