import { expect, test } from "./fixtures";
import { appUrl, organizer, publishedFreeEvent, sql } from "./helpers";

test("vente sur place : onglet Vente du scanner en espèces, rapport de caisse, puis paiement par QR code sur le téléphone du client (section 9.27)", async ({
  page,
  browser,
}) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Bal ${id}`, 10);

  // l'organisateur crée un lien de caisse avec la vente sur place autorisée
  await page.goto(`${eventUrl}/entries`);
  await page.getByRole("button", { name: "+ Nouveau lien bénévole" }).click();
  await page.getByLabel("Libellé").fill("Caisse 1");
  await page.getByLabel("Autoriser la vente sur place (espèces)").check();
  await page.getByRole("button", { name: "Créer le lien" }).click();
  await expect(page.getByText("Caisse 1")).toBeVisible();
  const url = (await page.getByTestId("scanner-url").textContent())!;
  const token = url.split("/s/")[1]!;

  // le téléphone de l'équipe, sans compte : onglet Vente, 2 billets en espèces, e-mail du client
  const staff = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "fr-BE",
  });
  const scan = await staff.newPage();
  await scan.goto(url);
  await scan.getByRole("button", { name: "Vente" }).click();
  await scan.getByRole("button", { name: "+ Fosse" }).click();
  await scan.getByRole("button", { name: "+ Fosse" }).click();
  await scan.getByLabel(/E-mail du client/).fill(`client${id}@exemple.be`);
  await scan.getByRole("button", { name: /^Encaisser .* en espèces$/ }).click();
  await expect(
    scan.getByText("Vente enregistrée : 2 billets, entrée validée."),
  ).toBeVisible();

  // rapport de caisse de l'organisateur
  await page.goto(`${eventUrl}/cash`); // la caisse a sa page (refonte de la navigation)
  await expect(page.getByText("Rapport de caisse")).toBeVisible();
  await expect(page.getByText("Caisse 1 · espèces")).toBeVisible();
  // par appareil, avec les espèces à remettre, et l'appareil dans l'export (RG-POS-07)
  await expect(
    page.getByText(/^Caisse 1 · espèces · appareil [A-Z0-9?]{1,4}$/),
  ).toBeVisible();
  await expect(page.getByText("Espèces à remettre")).toBeVisible();
  const caisseCsv = await (
    await page.request.get(`${eventUrl}/caisse.csv`)
  ).text();
  expect(caisseCsv).toContain('"Caisse";"Appareil";"Mode"');
  expect(caisseCsv).toMatch(/"Caisse 1";"[A-Z0-9?]{1,4}";"Espèces"/);

  // paiement par QR code : l'adresse du QR code, demandée comme le fait l'écran du scanner, ouverte sur le téléphone du client
  const eventId = eventUrl.split("/").pop()!;
  const ticketTypeId = sql(
    `select id from "TicketType" where "eventId" = '${eventId}'`,
  );
  // interface du scanner appelée sur l'hôte de l'app : Node ne résout pas scanner.localhost comme un navigateur
  const api = appUrl(`/api/scanner/${token}/sell`);
  const sale = await (
    await scan.request.post(api, {
      data: { action: "qr", lines: [{ ticketTypeId, quantity: 1 }] },
    })
  ).json();
  expect(sale.url).toMatch(/\/payer\/[A-Za-z0-9_-]{43}$/);
  expect(new URL(sale.url).pathname.startsWith("/payer/")).toBe(true); // page de paiement sur place du site de l'organisateur
  expect(
    (await (await scan.request.get(`${api}?order=${sale.orderId}`)).json())
      .status,
  ).toBe("PENDING");
  const client = await (
    await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: "fr-BE",
    })
  ).newPage();
  await client.goto(sale.url);
  await expect(client.getByText("Paiement sur place")).toBeVisible();
  await expect(
    client.getByRole("heading", { name: `Bal ${id}` }),
  ).toBeVisible();
  await client.getByLabel("Prénom").first().fill("Noah");
  await client.getByLabel("Nom", { exact: true }).fill("Lambert");
  await client.getByLabel("Adresse e-mail").fill(`noah${id}@exemple.be`);
  await client
    .getByRole("button", { name: "Confirmer ma réservation" })
    .click();
  await client.waitForURL(/\/billets\/[A-Za-z0-9_-]{43}$/);
  // l'écran de l'équipe voit le paiement, et le billet est marqué entré
  expect(
    await (await scan.request.get(`${api}?order=${sale.orderId}`)).json(),
  ).toEqual({ status: "PAID", tickets: 1 });
  expect(
    sql(`select status from "Ticket" where "orderId" = '${sale.orderId}'`),
  ).toBe("CHECKED_IN");
});
