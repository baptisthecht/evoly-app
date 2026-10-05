import { expect, test } from "@playwright/test";
import { appUrl, organizer, sql } from "./helpers";

test("éditeur d'e-mails : mise en forme, bouton, aperçu en temps réel, bloc HTML nettoyé, enregistrement", async ({ page }) => {
  const { slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
  await page.goto(appUrl(`/o/${slug}/marketing/campaigns/new?template=blank`));
  const editor = page.getByRole("textbox", { name: "Contenu de l'e-mail" });
  const preview = page.frameLocator(`iframe[title="Aperçu de l'e-mail"]`);

  // texte en gras : visible dans l'aperçu, sans rien enregistrer
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Texte important");
  await page.keyboard.down("Shift");
  for (let i = 0; i < "Texte important".length; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "Gras" }).click();
  await expect(preview.locator("strong", { hasText: "Texte important" })).toBeVisible();

  // bouton réglé dans le panneau
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Bouton", exact: true }).click();
  await page.locator(".email-atom--button").click();
  await page.getByLabel("Texte du bouton").fill("Je réserve");
  await page.getByLabel("Adresse du bouton").fill("https://evoly.me/gala");
  await expect(preview.getByRole("link", { name: "Je réserve" })).toHaveAttribute("href", "https://evoly.me/gala");

  // bloc HTML piégé : le code dangereux est retiré, l'utilisateur est prévenu
  await page.getByRole("button", { name: "HTML", exact: true }).click();
  await page.locator(".email-atom--html").click();
  await page.getByLabel("Code HTML").fill('<p>Bloc maison</p><script>alert(1)</script><img src="https://exemple.be/a.png" onerror="alert(2)">');
  await expect(preview.getByText("Bloc maison")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("scripts");
  await expect(page.getByRole("status")).toContainText("gestionnaires d'événements");
  expect(await preview.locator("script").count()).toBe(0);
  expect(await preview.locator("[onerror]").count()).toBe(0);

  // enregistré au nouveau format, retrouvé après rechargement
  await page.getByLabel("Nom de la campagne").fill("Gala de printemps");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForURL(/\/marketing\/campaigns\/c[a-z0-9]{20,}$/);
  await page.reload();
  await expect(editor.locator("strong", { hasText: "Texte important" })).toBeVisible();
  await expect(editor.locator(".email-atom--button")).toContainText("Je réserve");
  const stored = sql(`select content::text from "EmailCampaign" where "organizationId" = '${orgId}' order by "createdAt" desc limit 1`);
  const doc = JSON.parse(stored) as { type: string; content: Array<{ type: string; attrs?: Record<string, string> }> };
  expect(doc.type).toBe("doc");
  expect(doc.content.find((b) => b.type === "button")?.attrs).toMatchObject({ label: "Je réserve", href: "https://evoly.me/gala" });
  const html = doc.content.find((b) => b.type === "rawHtml")?.attrs?.html ?? "";
  expect(html).toContain("<p>Bloc maison</p>");
  expect(html).not.toMatch(/<script|onerror/i);
});
