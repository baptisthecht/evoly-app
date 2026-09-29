import { expect, test } from "@playwright/test";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test("scanner bénévole : sans compte, code court, déjà scanné, inconnu, recherche, hors ligne, révocation", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Soirée ${id}`, 10);
  await buyFree(page, siteUrl(slug, `/soiree-${id}`), "Fosse", 3, `lea.${id}@exemple.be`);
  const codes = sql(`select t."shortCode" from "Ticket" t join "Event" e on e.id = t."eventId" where e.slug = 'soiree-${id}' order by t."createdAt", t.id`).split("\n");
  expect(codes).toHaveLength(3);

  // US-SCN-01 : lien bénévole
  await page.goto(`${eventUrl}/entries`);
  await expect(page.getByText("0 / 3").first()).toBeVisible();
  await page.getByRole("button", { name: "+ Nouveau lien bénévole" }).click();
  await page.getByLabel("Libellé").fill("Porte A");
  await page.getByRole("button", { name: "Créer le lien" }).click();
  await expect(page.getByText("Porte A")).toBeVisible();
  const url = (await page.getByTestId("scanner-url").textContent())!;
  expect(url).toMatch(/^http:\/\/scanner\.localhost:3001\/s\/[A-Za-z0-9_-]{43}$/);

  // le bénévole ouvre le lien sur son téléphone, sans session
  const volunteer = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-BE" });
  const scan = await volunteer.newPage();
  await scan.goto(url);
  await expect(scan.getByText(`Soirée ${id}`)).toBeVisible();
  await expect(scan.getByText("Porte A")).toBeVisible();
  const enter = async (code: string) => {
    await scan.getByLabel("Code court").fill(code);
    await scan.getByRole("button", { name: "Valider" }).click();
  };
  const dismissed = () => expect(scan.getByTestId("scan-feedback")).toHaveCount(0, { timeout: 4000 });

  await enter(`${codes[0]!.slice(0, 4).toLowerCase()} ${codes[0]!.slice(4)}`);
  await expect(scan.getByTestId("scan-feedback")).toContainText("Entrée validée");
  await expect(scan.getByTestId("scan-feedback")).toContainText("Léa Martin · Fosse");
  await dismissed();
  await enter(codes[0]!);
  await expect(scan.getByTestId("scan-feedback")).toContainText("Déjà scanné");
  await expect(scan.getByTestId("scan-feedback")).toContainText("entrée Porte A");
  await dismissed();
  await enter("ZZZZZZZZ");
  await expect(scan.getByTestId("scan-feedback")).toContainText("Billet inconnu");
  await dismissed();

  // RG-SCN-07 : recherche, puis confirmation avant l'entrée
  await scan.getByRole("button", { name: "Rechercher" }).click();
  await scan.getByLabel("Nom, e-mail ou code court").fill(codes[1]!);
  await scan.getByRole("button", { name: "Faire entrer" }).click();
  await expect(scan.getByRole("dialog")).toContainText("Faire entrer Léa Martin");
  await scan.getByRole("button", { name: "Confirmer" }).click();
  await expect(scan.getByTestId("scan-feedback")).toContainText("Entrée validée");
  await dismissed();
  await scan.getByRole("button", { name: "Scanner" }).click();

  // US-SCN-04 : hors ligne, validation locale et file d'attente, puis synchronisation
  await volunteer.setOffline(true);
  await enter(codes[2]!);
  await expect(scan.getByTestId("scan-feedback")).toContainText("Entrée validée");
  await expect(scan.getByTestId("scan-feedback")).toContainText("Hors ligne");
  await dismissed();
  await expect(scan.getByText("1 scan en attente")).toBeVisible();
  await expect(scan.getByText("Hors ligne", { exact: true })).toBeVisible();
  await volunteer.setOffline(false);
  await expect(scan.getByText("1 scan en attente")).toHaveCount(0, { timeout: 10_000 });
  await expect(scan.getByText("En ligne", { exact: true })).toBeVisible();
  expect(sql(`select count(*) from "Ticket" t join "Event" e on e.id = t."eventId" where e.slug = 'soiree-${id}' and t.status = 'CHECKED_IN'`)).toBe("3");

  // RG-SCN-09 : suivi en direct côté organisateur
  await page.goto(`${eventUrl}/entries`);
  await expect(page.getByText("3 / 3").first()).toBeVisible();
  await expect(page.getByText("100 %")).toBeVisible();

  // US-SCN-05 : révocation immédiate
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Révoquer" }).click();
  await expect(page.getByText("Révoqué", { exact: true })).toBeVisible();
  await scan.reload();
  await expect(scan.getByText("Ce lien a été révoqué")).toBeVisible();
  await volunteer.close();
});

test("membre : « Ouvrir le scanner » depuis le tableau de bord (US-SCN-06)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Bal ${id}`, 5);
  await page.goto(`${eventUrl}/entries`);
  await page.getByRole("button", { name: "Ouvrir le scanner" }).click();
  await page.waitForURL(/^http:\/\/scanner\.localhost:3001\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText(`Bal ${id}`)).toBeVisible();
  await expect(page.getByText("Camille Dupont")).toBeVisible();
  // le tableau de bord n'est pas accessible depuis l'hôte du scanner
  expect((await page.goto(`http://scanner.localhost:3001/o/${slug}`))?.status()).toBe(404);
  expect((await page.goto(appUrl(`/scanner/s/${"A".repeat(43)}`)))?.status()).toBe(404);
});
