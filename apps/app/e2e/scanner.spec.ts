import { expect, test } from "@playwright/test";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test("scanner bénévole : sans compte, code court, déjà scanné, inconnu, recherche, hors ligne, révocation", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Soirée ${id}`, 10);
  await buyFree(page, siteUrl(slug, `/soiree-${id}`), "Fosse", 3, `lea.${id}@exemple.be`);
  const codes = sql(
    `select t."shortCode" from "Ticket" t join "Event" e on e.id = t."eventId" where e.slug = 'soiree-${id}' order by t."createdAt", t.id`,
  ).split("\n");
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

test("vérification seule : le billet est contrôlé sans être validé, puis entre normalement", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Expo ${id}`, 10);
  await buyFree(page, siteUrl(slug, `/expo-${id}`), "Fosse", 1, `lea.${id}@exemple.be`);
  const code = sql(`select t."shortCode" from "Ticket" t join "Event" e on e.id = t."eventId" where e.slug = 'expo-${id}' limit 1`);
  const ticket = (q: string) => sql(`select ${q} from "Ticket" t join "Event" e on e.id = t."eventId" where e.slug = 'expo-${id}'`);
  const entries = () => sql(`select count(*) from "CheckIn" c join "Event" e on e.id = c."eventId" where e.slug = 'expo-${id}'`);

  // contrôle au périmètre : lien en vérification seule
  await page.goto(`${eventUrl}/entries`);
  await page.getByRole("button", { name: "+ Nouveau lien bénévole" }).click();
  await page.getByLabel("Libellé").fill("Périmètre");
  await page.getByLabel(/^Vérification seule/).check();
  await page.getByRole("button", { name: "Créer le lien" }).click();
  await expect(page.getByText(/vérification seule/).first()).toBeVisible();
  const perimeter = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-BE" });
  const p = await perimeter.newPage();
  const perimeterUrl = (await page.getByTestId("scanner-url").first().textContent())!;
  await p.goto(perimeterUrl);
  await expect(p.getByText("Vérification seule : les billets sont contrôlés sans être validés.")).toBeVisible();
  await expect(p.getByRole("group", { name: "Mode du scanner" })).toHaveCount(0); // imposé par le lien
  for (let i = 0; i < 2; i++) {
    await p.getByLabel("Code court").fill(code);
    await p.getByRole("button", { name: "Vérifier" }).click();
    await expect(p.getByText("Billet valable")).toBeVisible();
    await expect(p.getByText(/entrée non validée/)).toBeVisible();
    await p.waitForTimeout(1600);
  }
  expect(ticket("t.status")).toBe("VALID");
  expect(entries()).toBe("0");
  await perimeter.close();

  // à l'entrée de la salle : lien normal, vérification possible, puis entrée validée
  await page.reload();
  await page.getByRole("button", { name: "+ Nouveau lien bénévole" }).click();
  await page.getByLabel("Libellé").fill("Salle");
  await page.getByRole("button", { name: "Créer le lien" }).click();
  await expect(page.getByText("Salle").first()).toBeVisible();
  // l'adresse du nouveau lien : celle qui n'est pas l'adresse du périmètre, quel que soit l'ordre d'affichage
  const others = async () => (await page.getByTestId("scanner-url").allTextContents()).filter((u) => u.trim() && u !== perimeterUrl);
  await expect.poll(async () => (await others()).length).toBeGreaterThan(0);
  const hallUrl = (await others())[0]!;
  const hall = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-BE" });
  const h = await hall.newPage();
  await h.goto(hallUrl);
  await expect(h.getByRole("group", { name: "Mode du scanner" })).toBeVisible(); // lien normal : mode au choix
  await h.getByRole("button", { name: "Vérification" }).click();
  await h.getByLabel("Code court").fill(code);
  await h.getByRole("button", { name: "Vérifier" }).click();
  await expect(h.getByText("Billet valable")).toBeVisible();
  expect(ticket("t.status")).toBe("VALID");
  await h.waitForTimeout(1600);
  await h.getByRole("button", { name: "Entrée", exact: true }).click();
  await h.getByLabel("Code court").fill(code);
  await h.getByRole("button", { name: "Valider" }).click();
  await expect(h.getByText("Entrée validée")).toBeVisible();
  expect(ticket("t.status")).toBe("CHECKED_IN");
  expect(entries()).toBe("1");
  await hall.close();
});
