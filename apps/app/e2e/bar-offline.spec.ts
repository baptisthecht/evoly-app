import { expect, test } from "./fixtures";
import { buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("bar sans réseau : options retrouvées dans la liste du téléphone, retrait mis en file d'attente, envoyé à la reconnexion (RG-OPT-05)", async ({
  page,
  browser,
}) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Cave ${id}`, 10);
  const eventId = eventUrl.split("/").pop()!;
  const eventSlug = sql(`select slug from "Event" where id = '${eventId}'`);
  await buyFree(page, siteUrl(slug, `/${eventSlug}`), "Fosse", 1, `client${id}@exemple.be`);
  const orderId = sql(`select id from "Order" where "eventId" = '${eventId}'`);
  const shortCode = sql(`select "shortCode" from "Ticket" where "orderId" = '${orderId}'`);
  // deux jetons boissons sur cette commande
  sql(`insert into "EventOption" (id, "eventId", name, "priceMinor", "updatedAt") values ('opt-${id}', '${eventId}', 'Jeton boisson', 0, now())`);
  sql(
    `insert into "OrderOption" (id, "orderId", "optionId", quantity, "unitPriceMinor", "unitFeeMinor") values ('oo-${id}', '${orderId}', 'opt-${id}', 2, 0, 0)`,
  );

  await page.goto(`${eventUrl}/entries`);
  await page.getByRole("button", { name: "+ Nouveau lien bénévole" }).click();
  await page.getByLabel("Libellé").fill("Bar");
  await page.getByRole("button", { name: "Créer le lien" }).click();
  const url = (await page.getByTestId("scanner-url").textContent())!;

  // le téléphone du bar télécharge sa liste, puis le réseau est coupé
  const staff = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-BE" });
  const bar = await staff.newPage();
  await bar.goto(url);
  await bar.getByRole("button", { name: "Bar et options" }).click();
  await expect(bar.getByText("Scannez un billet pour voir ses options.")).toBeVisible();
  await staff.setOffline(true);
  await bar.getByLabel("Code court").fill(shortCode);
  await bar.getByRole("button", { name: "Valider" }).click();
  await expect(bar.getByText("Sans réseau : options d'après la liste du téléphone.")).toBeVisible();
  await expect(bar.getByText("2 sur 2 restant(s)")).toBeVisible();
  await bar.getByRole("button", { name: "Retirer 1" }).click();
  await expect(bar.getByText(/Sans réseau : retrait enregistré, envoyé dès le retour du réseau\. 1 retrait en attente\./)).toBeVisible();
  await expect(bar.getByText("1 sur 2 restant(s)")).toBeVisible();
  expect(sql(`select redeemed from "OrderOption" where id = 'oo-${id}'`)).toBe("0"); // rien n'est encore parti

  // le réseau revient : la file est envoyée et le retrait enregistré, marqué « hors ligne »
  await staff.setOffline(false);
  await expect.poll(() => sql(`select redeemed from "OrderOption" where id = 'oo-${id}'`), { timeout: 30_000 }).toBe("1");
  expect(sql(`select offline from "OptionRedemption" where "orderOptionId" = 'oo-${id}'`)).toBe("t");
});
