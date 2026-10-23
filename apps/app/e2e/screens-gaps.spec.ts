import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import {
  appUrl,
  buyFree,
  organizer,
  publishedFreeEvent,
  siteUrl,
  uid,
} from "./helpers";
import { firstLink, lastEmail } from "./outbox";

// les vrais textes français (parcours lancés depuis apps/app, en local comme en CI)
const fr = JSON.parse(
  readFileSync("../../packages/i18n/messages/fr.json", "utf8"),
) as Record<string, Record<string, string>>;
// écrans qu'aucun parcours n'ouvrait encore (mesure de la couverture des parcours, 19 octobre 2026)
const [o, a, pub] = [fr.orders!, fr.auth!, fr.publication!];
test.beforeEach(({}, testInfo) =>
  test.skip(
    testInfo.project.name !== "desktop",
    "un seul format suffit pour ces écrans",
  ),
);

async function draftEvent(
  page: import("@playwright/test").Page,
  slug: string,
  title: string,
) {
  await page.goto(appUrl(`/o/${slug}/events/new`));
  await page.getByLabel("Titre").fill(title);
  await page.getByLabel("Nom du lieu").fill("La Madeleine");
  await page.getByLabel("Ville").fill("Bruxelles");
  await page.getByLabel("Nom du tarif").fill("Fosse");
  await page.getByLabel(/^Prix/).fill("0");
  await page.getByLabel("Quantité").fill("50");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(/\/events\/c[a-z0-9]{20,}$/);
  return page.url();
}

test("un acheteur retrouve ses billets par e-mail, puis ouvre le lien reçu", async ({
  page,
}) => {
  const { slug } = await organizer(page);
  const id = uid();
  await publishedFreeEvent(page, slug, `Gala ${id}`, 10);
  const email = `retrouve${id}@exemple.be`;
  await buyFree(page, siteUrl(slug, `/gala-${id}`), "Fosse", 1, email);
  await page.goto(siteUrl(slug, "/billets"));
  await page.getByLabel(o.lookupEmail!).fill(email);
  await page.getByRole("button", { name: o.lookupSubmit }).click();
  await expect(page.getByRole("status")).toHaveText(o.lookupSent!);
  await page.goto(firstLink((await lastEmail(email, "order.lookup")).text));
  await expect(page.getByText(`Gala ${id}`).first()).toBeVisible();
});

test("mot de passe oublié : la demande envoie l'e-mail de réinitialisation", async ({
  page,
}) => {
  const { id } = await organizer(page);
  await page.context().clearCookies();
  await page.goto(appUrl("/forgot-password"));
  await page.getByLabel(a.email!).fill(`orga${id}@exemple.be`);
  await page.getByRole("button", { name: "Recevoir un lien" }).click();
  await expect(page.getByText(a.resetSent!.slice(0, 30))).toBeVisible();
  expect(
    firstLink(
      (await lastEmail(`orga${id}@exemple.be`, "account.reset_password")).text,
    ),
  ).toContain("reset-password");
});

test("compte pas encore confirmé : l'e-mail de vérification se renvoie", async ({
  page,
}) => {
  const id = uid();
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  });
  await page.goto(appUrl("/register"));
  await page.getByLabel("Votre nom").fill("Zoé Lambert");
  await page.getByLabel("Adresse e-mail").fill(`attente${id}@exemple.be`);
  await page.getByLabel("Mot de passe").fill("Motdepasse-2026!");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(/\/verify-email/);
  await page.getByRole("button", { name: a.verifyResend }).click();
  await expect(page.getByText(a.verifyResent!.slice(0, 20))).toBeVisible();
});

test("mise en ligne d'un brouillon : publication après le début refusée, puis programmée", async ({
  page,
}) => {
  const { slug } = await organizer(page);
  const eventUrl = await draftEvent(page, slug, `Concert ${uid()}`);
  await page.goto(`${eventUrl}/launch`);
  await page.getByLabel(pub.optScheduled!).check();
  const date = page.getByLabel(/^Date et heure/);
  const save = page
    .getByRole("button", { name: pub.save, exact: true })
    .first();
  await date.fill("2030-01-15T10:00"); // après le début de l'événement : refusé (RG-PRG-01)
  await save.click();
  // chaque message visé par son texte : l'encadré « Programmé » est aussi un statut, affiché selon le rafraîchissement
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "avant le début de l’événement" }),
  ).toBeVisible();
  await date.fill(
    new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 16),
  ); // dans trois heures : accepté
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: pub.saved! }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /^Programmé/ }),
  ).toBeVisible();
});

test("apparence, tables et plan de salle s'ouvrent sans erreur", async ({
  page,
}) => {
  const { slug } = await organizer(page);
  const eventUrl = await draftEvent(page, slug, `Salon ${uid()}`);
  for (const path of ["appearance", "tables", "seating"]) {
    const res = await page.goto(`${eventUrl}/${path}`);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
  }
});
