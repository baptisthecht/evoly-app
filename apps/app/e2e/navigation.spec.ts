import { expect, test, type Page } from "./fixtures";
import { appUrl, organizer, publishedFreeEvent } from "./helpers";

/** Une couleur du thème (fond), telle que le navigateur la calcule. */
const background = (page: Page, value: string) =>
  page.evaluate((v) => {
    const d = document.createElement("div");
    d.style.backgroundColor = v;
    document.body.appendChild(d);
    const c = getComputedStyle(d).backgroundColor;
    d.remove();
    return c;
  }, value);

test("barre latérale (maquette validée) : page active sur fond gris, autres pages sans fond, fond gris au survol", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "la barre latérale est visible sur ordinateur ; sur téléphone, elle est dans le menu",
  );
  const { slug } = await organizer(page);
  await page.goto(appUrl(`/o/${slug}`));
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  const grey = await background(page, "var(--surface)");
  const home = nav.getByRole("link", { name: "Accueil" });
  await expect(home).toHaveAttribute("aria-current", "page");
  await expect(home).toHaveCSS("background-color", grey);
  await expect(home).toHaveCSS("font-weight", "500");
  const finances = nav.getByRole("link", { name: "Finances" });
  await expect(finances).not.toHaveAttribute("aria-current", "page");
  await expect(finances).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await finances.hover();
  await expect(finances).toHaveCSS("background-color", grey);
});

test("événement : la barre de l'organisation reste, sept parties en onglets, toutes les pages de la partie ouverte, retour", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "la barre latérale est visible sur ordinateur",
  );
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Soirée ${id}`, 10);
  await page.goto(eventUrl);
  const main = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(main.getByRole("link", { name: "Événements" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const tabs = page.getByRole("navigation", {
    name: "Sections de l’événement",
  });
  await expect(tabs.getByRole("link")).toHaveText([
    "Vue d’ensemble",
    "Billetterie",
    "Participants",
    "Apparence",
    "Vente",
    "Jour J",
    "Réglages",
  ]);
  await expect(
    tabs.getByRole("link", { name: "Vue d’ensemble" }),
  ).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Billetterie" }).click();
  await expect(page).toHaveURL(/\/tickets$/);
  const pages = page.getByRole("navigation", { name: "Pages de la section" });
  await expect(pages.getByRole("link", { name: "Tarifs" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(tabs.getByRole("link", { name: "Billetterie" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // toutes les fonctionnalités affichées directement, sans menu à déplier
  await expect(pages.getByRole("link")).toHaveText([
    "Tarifs",
    "Billets offerts",
    "Questions",
    "Options",
    "Tables",
    "Plan de salle",
  ]);
  await pages.getByRole("link", { name: "Options", exact: true }).click();
  await expect(page).toHaveURL(/\/options$/);
  await expect(
    pages.getByRole("link", { name: "Options", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await main.getByRole("link", { name: "Événements" }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${slug}/events$`));
  await expect(
    page.getByRole("navigation", { name: "Sections de l’événement" }),
  ).toHaveCount(0);
});

test("téléphone : la barre d'onglets de l'organisation ; dans un événement, la sienne et ses parties en haut", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "la barre d'onglets remplace la barre latérale sur téléphone",
  );
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Soirée ${id}`, 10);
  await page.goto(appUrl(`/o/${slug}`));
  // barre d'onglets du téléphone : les onglets de l'organisation, puis ceux de l'événement
  await expect(
    page
      .getByRole("navigation", { name: "Navigation de l’organisation" })
      .getByRole("link", { name: "Finances" }),
  ).toBeVisible();
  await page.goto(eventUrl);
  await page
    .getByRole("navigation", { name: "Navigation de l’événement" })
    .getByRole("link", { name: "Participants" })
    .click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.goto(eventUrl);
  const tabs = page.getByRole("navigation", {
    name: "Sections de l’événement",
  });
  await tabs.getByRole("link", { name: "Billetterie" }).click();
  await expect(page).toHaveURL(/\/tickets$/);
  await expect(
    page
      .getByRole("navigation", { name: "Pages de la section" })
      .getByRole("link", { name: "Tarifs" }),
  ).toBeVisible();
});
