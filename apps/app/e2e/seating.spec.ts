import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("plan de salle : modèle, déplacement d'un bloc, place bloquée, choix de l'acheteur, billet avec sa place (section 9.9)", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(`insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`);
  const eventUrl = await publishedFreeEvent(page, slug, `Opéra ${id}`, 20);
  const eventId = sql(`select id from "Event" where slug = 'opera-${id}'`);

  // modèle : salle des fêtes, 2 rangs de 6 places, sans allée, une catégorie
  await page.goto(`${eventUrl}/seating`);
  await page.getByRole("radio", { name: "Salle des fêtes" }).check();
  await page.getByLabel("Rangs", { exact: true }).fill("2");
  await page.getByLabel("Places au premier rang").fill("6");
  await page.getByLabel("Places au dernier rang").fill("6");
  await page.getByLabel("Allée centrale", { exact: true }).uncheck();
  await page.getByLabel("Catégories de prix").selectOption("1");
  await page.getByRole("button", { name: "Générer le plan" }).click();
  await expect(page.getByText(/^12 places/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Plan de salle, 12 places" })).toBeVisible();

  // déplacement d'un bloc en le faisant glisser
  const blockX = () => sql(`select b.x from "SeatingBlock" b join "SeatingMap" m on m.id = b."seatingMapId" where m."eventId" = '${eventId}' and b.kind = 'ROWS'`);
  const seat = page.locator("[data-seat]").first();
  await seat.scrollIntoViewIfNeeded();
  const box = (await seat.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(blockX).not.toBe("0");

  // place bloquée
  await page.getByLabel("Rang", { exact: true }).fill("A");
  await page.getByLabel("Place", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Trouver" }).click();
  await expect(page.getByRole("heading", { name: "Rang A, place 1" })).toBeVisible();
  await page.getByLabel("Bloquée (non vendue)").check();
  await page.getByRole("button", { name: "Enregistrer la place" }).click();
  await expect(page.getByText(/1 bloquée/)).toBeVisible();

  // vente : placement numéroté, choix par l'acheteur
  await page.getByLabel(/Placement numéroté/).check();
  await expect.poll(() => sql(`select "seatingMode" from "Event" where id = '${eventId}'`)).toBe("ASSIGNED");
  await page.getByLabel(/L’acheteur choisit ses places/).check();
  await expect.poll(() => sql(`select "allowSeatChoice" from "Event" where id = '${eventId}'`)).toBe("t");

  const guest = await (await browser.newContext({ locale: "fr-BE" })).newPage();
  await guest.goto(siteUrl(slug, `/opera-${id}`));
  const tickets = guest.locator("#billets");
  await tickets.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await tickets.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  // « Continuer » réserve directement les meilleures places ; l'acheteur peut les voir et les changer
  await tickets.getByRole("button", { name: "Continuer" }).click();
  await expect(tickets.getByText(/^Nous vous avons réservé les meilleures places disponibles : rang/)).toBeVisible();
  await tickets.getByRole("button", { name: "Voir ou changer mes places" }).click();
  await tickets.getByRole("button", { name: "Effacer ma sélection" }).click();
  await tickets.getByRole("button", { name: "Rang A, place 2 : libre" }).click();
  await tickets.getByRole("button", { name: "Rang A, place 3 : libre" }).click();
  await tickets.getByRole("button", { name: "Valider ces places" }).click();
  await expect(tickets.getByText("Vos places : rang A, places 2 et 3.")).toBeVisible();
  await tickets.getByLabel("Prénom").first().fill("Léa");
  await tickets.getByLabel("Nom", { exact: true }).fill("Martin");
  await tickets.getByLabel("Adresse e-mail").fill(`lea.${id}@exemple.be`);
  await tickets.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await guest.waitForURL(/\/billets\//);
  await expect(guest.getByTestId("seat")).toHaveText(["Rang A · Place 2", "Rang A · Place 3"]);

  // « venez à plusieurs » : le lien partagé depuis la page des billets
  await expect(guest.getByRole("heading", { name: "Venez à plusieurs ?" })).toBeVisible();
  const friendLink = await guest.getByLabel("Lien à partager").inputValue();
  expect(friendLink).toContain("?amis=");

  // second acheteur, venu par le lien de Léa : il garde les places proposées, les plus proches des siennes
  const guest2 = await (await browser.newContext({ locale: "fr-BE" })).newPage();
  await guest2.goto(siteUrl(slug, `/opera-${id}?amis=${new URL(friendLink).searchParams.get("amis")}`));
  await expect(guest2.getByText(/Léa a réservé ses places/)).toBeVisible();
  const box2 = guest2.locator("#billets");
  await box2.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box2.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box2.getByRole("button", { name: "Continuer" }).click();
  await expect(box2.getByText(/^Nous vous avons réservé les places libres les plus proches de Léa : rang [AB], places \d+ et \d+\./)).toBeVisible();
  if (process.env.SEAT_SHOT) await guest2.screenshot({ path: process.env.SEAT_SHOT });
  await box2.getByLabel("Prénom").first().fill("Hugo");
  await box2.getByLabel("Nom", { exact: true }).fill("Leroy");
  await box2.getByLabel("Adresse e-mail").fill(`hugo.${id}@exemple.be`);
  await box2.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await guest2.waitForURL(/\/billets\//);
  const places = await guest2.getByTestId("seat").allTextContents();
  expect(places).toHaveLength(2);
  expect(new Set(places.map((p) => p.split(" · ")[0])).size).toBe(1);

  // l'organisateur change Léa de place (même catégorie), avec l'e-mail du billet mis à jour
  await page.reload();
  await page.getByLabel("Rang", { exact: true }).fill("A");
  await page.getByLabel("Place", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Trouver" }).click();
  await expect(page.getByText(/Léa Martin/)).toBeVisible();
  await page.getByRole("button", { name: "Changer de place" }).click();
  const target = sql(`select s.id from "Seat" s join "SeatingRow" r on r.id = s."rowId" join "SeatingMap" m on m.id = r."seatingMapId" where m."eventId" = '${eventId}' and r.name = 'B' and s.label = '6' and s.status = 'AVAILABLE'`);
  expect(target).not.toBe("");
  await page.locator(`[data-seat="${target}"]`).click();
  await page.getByRole("button", { name: "Confirmer le changement de place" }).click();
  await expect.poll(() => sql(`select count(*) from "Ticket" where "seatId" = '${target}'`)).toBe("1");

  // plan d'occupation pour l'accueil
  await page.goto(`${eventUrl}/entries`);
  await expect(page.getByRole("heading", { name: "Plan d’occupation" })).toBeVisible();
  await expect(page.getByText(/Personne n’est encore entré sur 4 places vendues/)).toBeVisible();

  // bibliothèque : la salle enregistrée se retrouve dans le choix du modèle
  await page.goto(`${eventUrl}/seating`);
  await page.getByLabel("Nom de la salle").fill(`Salle des fêtes ${id}`);
  await page.getByLabel("Ville").fill("Mouscron");
  await page.getByRole("button", { name: "Enregistrer la salle" }).click();
  await expect(page.getByText("Salle enregistrée")).toBeVisible();

  // carte de chaleur des ventes
  await page.getByRole("button", { name: "Carte de chaleur des ventes" }).click();
  await expect(page.getByText(/places vendues sur/)).toBeVisible();

  // vue depuis la place : photo du bloc, visible par l'acheteur
  await page.getByRole("button", { name: "Salle", exact: true }).click();
  const photo = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#A9C4F2" } }).jpeg().toBuffer();
  await page.getByLabel("Photo de la vue").setInputFiles({ name: "vue.jpg", mimeType: "image/jpeg", buffer: photo });
  await page.getByRole("button", { name: "Ajouter la photo" }).click();
  await expect(page.getByRole("img", { name: "Vue depuis Salle" })).toBeVisible();
  const guest3 = await (await browser.newContext({ locale: "fr-BE" })).newPage();
  await guest3.goto(siteUrl(slug, `/opera-${id}`));
  await guest3.locator("#billets").getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await guest3.locator("#billets").getByRole("button", { name: "Continuer" }).click();
  await guest3.getByRole("button", { name: "Voir ou changer mes places" }).click();
  await guest3.getByRole("button", { name: "Voir la vue depuis ces places" }).click();
  await expect(guest3.getByRole("dialog")).toBeVisible();
  await guest3.getByRole("button", { name: "Fermer" }).click();
  await expect(guest3.getByRole("dialog")).toBeHidden();

  // la place vendue est verrouillée dans l'éditeur
  await page.reload();
  await page.getByLabel("Rang", { exact: true }).fill("A");
  await page.getByLabel("Place", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Trouver" }).click();
  await expect(page.getByText("Vendue", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Changer de modèle" }).isDisabled();
  await expect(page.getByLabel("Numéro de la place")).toBeDisabled();
});
