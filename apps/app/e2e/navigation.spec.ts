import { expect, test, type Page } from "./fixtures";
import { appUrl, organizer, publishedFreeEvent } from "./helpers";

/** La couleur rose du thème, telle que le navigateur la calcule. */
const rose = (page: Page) =>
  page.evaluate(() => {
    const d = document.createElement("div");
    d.style.color = "var(--evoly-rose)";
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  });

test("barre latérale : page active en gras avec son segment rose, survol en gras sans fond ni arrondi", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "la barre latérale est visible sur ordinateur ; sur téléphone, elle est dans le menu");
  const { slug } = await organizer(page);
  await page.goto(appUrl(`/o/${slug}`));
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  const home = nav.getByRole("link", { name: "Accueil" });
  await expect(home).toHaveAttribute("aria-current", "page");
  await expect(home).toHaveCSS("font-weight", "600");
  await expect(home).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(home).toHaveCSS("border-top-left-radius", "0px");
  await expect(home).toHaveCSS("border-left-color", await rose(page));
  const finances = nav.getByRole("link", { name: "Finances" });
  await expect(finances).not.toHaveAttribute("aria-current", "page");
  await expect(finances).toHaveCSS("font-weight", "500");
  await finances.hover();
  await expect(finances).toHaveCSS("font-weight", "600");
  await expect(finances).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(finances).toHaveCSS("border-top-left-radius", "0px");
  await expect(finances).not.toHaveCSS("border-left-color", await rose(page));
});

test("barre latérale : bascule dans un événement, page ouverte surlignée, fonctionnalité ajoutée, retour à l'organisation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "la barre latérale est visible sur ordinateur");
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Soirée ${id}`, 10);
  await page.goto(eventUrl);
  const ev = page.getByRole("navigation", { name: "Navigation de l’événement" });
  await expect(ev.getByRole("link", { name: "Vue d’ensemble" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0); // une seule barre, celle de l'événement
  await ev.getByRole("link", { name: "Tarifs" }).click();
  await expect(page).toHaveURL(/\/tickets$/);
  await expect(ev.getByRole("link", { name: "Tarifs" })).toHaveAttribute("aria-current", "page");
  await expect(ev.getByRole("link", { name: "Tarifs" })).toHaveCSS("border-left-color", await rose(page));
  // fonctionnalité inutilisée : absente de la barre, proposée par « Ajouter une fonctionnalité »
  await expect(ev.getByRole("link", { name: "Options", exact: true })).toHaveCount(0);
  await ev.getByText("Ajouter une fonctionnalité").click();
  await ev.getByRole("link", { name: /^Options/ }).click();
  await expect(page).toHaveURL(/\/options$/);
  await expect(ev.getByRole("link", { name: "Options", exact: true })).toHaveAttribute("aria-current", "page"); // visible tant qu'on est sur sa page
  await ev.getByRole("link", { name: "Tous les événements" }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${slug}/events$`));
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Événements" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("téléphone : la navigation est dans le menu, et change aussi de contexte dans un événement", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "le menu remplace la barre latérale sur téléphone");
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Soirée ${id}`, 10);
  await page.goto(appUrl(`/o/${slug}`));
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Finances" })).toBeVisible();
  await page.goto(eventUrl);
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation de l’événement" }).getByRole("link", { name: "Tarifs" })).toBeVisible();
});
