import { expect, test } from "@playwright/test";
import { organizer, publishedFreeEvent } from "./helpers";

test("revente : vue d'ensemble de l'organisation, avec lien vers chaque événement (US-RSL-05)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Festival ${id}`, 30);
  await page.goto(`/o/${slug}/resale`);
  await expect(page.getByRole("heading", { level: 1, name: "Revente" })).toBeVisible();
  await expect(page.getByText("Cette section arrive bientôt")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Par événement" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: `Festival ${id}` });
  await expect(row.getByText("Revente activée")).toBeVisible();
  await row.getByRole("link", { name: "Gérer" }).click();
  await page.waitForURL(/\/events\/[^/]+\/resale$/);
});
