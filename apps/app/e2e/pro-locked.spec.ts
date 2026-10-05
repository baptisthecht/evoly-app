import { expect, test } from "@playwright/test";
import { organizer, publishedFreeEvent } from "./helpers";

test("offre gratuite : les fonctions Pro restent visibles, grisées, avec l'accès à l'abonnement", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Concert ${id}`, 20);
  for (const [path, title] of [
    ["/seating", "Plan de salle"],
    ["/settings", "E-mails marketing automatiques"],
  ] as const) {
    await page.goto(`${eventUrl}${path}`);
    const block = page.getByRole("region", { name: title });
    await expect(block).toBeVisible();
    await expect(block.getByText("Pro", { exact: true })).toBeVisible();
    await expect(block.getByRole("link", { name: "Passer en Pro" })).toHaveAttribute("href", `/o/${slug}/billing`);
  }
});
