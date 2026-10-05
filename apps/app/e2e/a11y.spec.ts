import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appUrl, organizer, publishedFreeEvent, siteUrl } from "./helpers";

// Accessibilité (WCAG 2.1 AA) : aucune violation grave ni critique sur les pages clés, sur ordinateur et téléphone
async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length)
    console.log(
      `\n[${name}]`,
      serious
        .map(
          (v) =>
            `${v.id} (${v.impact}) : ${v.help} → ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(" "))
              .join(" | ")}`,
        )
        .join("\n"),
    );
  return serious.map((v) => `${name} · ${v.id}`);
}

test("accessibilité des pages clés (WCAG 2.1 AA)", async ({ page, browser }) => {
  test.setTimeout(120_000); // onze pages auditées par axe : plus long qu’un parcours ordinaire
  const found: string[] = [];
  const guest = await (await browser.newContext({ locale: "fr-BE" })).newPage();
  await guest.goto(appUrl("/login"));
  found.push(...(await audit(guest, "connexion")));
  await guest.goto(appUrl("/register"));
  found.push(...(await audit(guest, "inscription")));

  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Festival ${id}`, 30);
  await page.goto(appUrl(`/o/${slug}`));
  found.push(...(await audit(page, "tableau de bord")));
  await page.goto(eventUrl);
  found.push(...(await audit(page, "aperçu de l'événement")));

  await guest.goto(siteUrl(slug, `/festival-${id}`));
  found.push(...(await audit(guest, "page de vente")));
  const box = guest.locator("#billets");
  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await expect(box.getByLabel("Adresse e-mail")).toBeVisible({ timeout: 20_000 }); // réservation côté serveur : plus lente sous charge
  found.push(...(await audit(guest, "formulaire d'achat")));
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(`lea.${id}@exemple.be`);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await guest.waitForURL(/\/billets\//);
  found.push(...(await audit(guest, "billets")));
  await guest.goto("http://scanner.localhost:3001/");
  found.push(...(await audit(guest, "scanner")));
  // thème sombre (préférence du système) : mêmes exigences
  await page.emulateMedia({ colorScheme: "dark" });
  await guest.emulateMedia({ colorScheme: "dark" });
  await page.goto(appUrl(`/o/${slug}`));
  found.push(...(await audit(page, "tableau de bord (sombre)")));
  await page.goto(eventUrl);
  found.push(...(await audit(page, "aperçu de l'événement (sombre)")));
  await guest.goto(siteUrl(slug, `/festival-${id}`));
  found.push(...(await audit(guest, "page de vente (sombre)")));
  expect(found).toEqual([]);
});

test("après connexion, retour à la page demandée (sécurité : chemin interne uniquement)", async ({ page, browser }) => {
  const { id } = await organizer(page);
  const ctx = await browser.newContext({ locale: "fr-BE", extraHTTPHeaders: { "x-forwarded-for": `10.64.${Math.floor(Math.random() * 250)}.3` } });
  const p = await ctx.newPage();
  await p.goto(appUrl("/acces-scanner"));
  await p.waitForURL(/\/login\?next=%2Facces-scanner|\/login\?next=\/acces-scanner/);
  await p.getByLabel("Adresse e-mail").fill(`orga${id}@exemple.be`);
  await p.getByLabel("Mot de passe").fill("Motdepasse-2026!");
  await p.getByRole("button", { name: "Se connecter" }).click();
  await p.waitForURL(/\/acces-scanner$/);
  await ctx.close();
});
