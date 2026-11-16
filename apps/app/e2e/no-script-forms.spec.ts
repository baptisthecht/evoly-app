import { expect, test } from "./fixtures";
import {
  buyFree,
  organizer,
  publishedFreeEvent,
  siteUrl,
  sql,
} from "./helpers";

// Constaté par la garde d'envoi le 16 novembre 2026 (parcours « code de gratuité… », sur téléphone) : un appui sur
// « Recevoir mes liens » avant que la page soit active (téléphone lent) rechargeait la page sans rien envoyer, et
// l'adresse saisie était perdue. Les boutons d'envoi de « Retrouver mes billets » et de « Prévenez-moi » restent
// désormais inactifs tant que la page ne l'est pas : sans JavaScript, ils le restent, et l'adresse tapée reste en place.
test("avant que la page soit active (téléphone lent) : « Recevoir mes liens » et « M’avertir » ne rechargent pas la page", async ({
  page,
  browser,
}) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Concert ${id}`, 10);
  await buyFree(
    page,
    siteUrl(slug, `/concert-${id}`),
    "Fosse",
    1,
    `lea.${id}@exemple.be`,
  );
  const eventId = eventUrl.split("/").pop()!;
  sql(
    `update "Event" set "salesStartAt" = now() + interval '2 days' where id = '${eventId}'`,
  ); // ventes pas encore ouvertes : « Prévenez-moi »

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const slow = await noScript.newPage();
  await slow.goto(siteUrl(slug, "/billets"));
  await slow.getByLabel("Adresse e-mail").fill(`lea.${id}@exemple.be`);
  await expect(
    slow.getByRole("button", { name: "Recevoir mes liens" }),
  ).toBeDisabled();
  await slow.getByLabel("Adresse e-mail").press("Enter"); // envoi implicite : bloqué aussi
  await expect(slow.getByLabel("Adresse e-mail")).toHaveValue(
    `lea.${id}@exemple.be`,
  );
  await expect(slow).toHaveURL(siteUrl(slug, "/billets"));

  await slow.goto(siteUrl(slug, `/concert-${id}`));
  await slow.getByLabel("Votre adresse e-mail").fill(`fan.${id}@exemple.be`);
  await expect(slow.getByRole("button", { name: "M’avertir" })).toBeDisabled();
  await noScript.close();

  // la page active : l'envoi fonctionne (parcours habituels : promo.spec.ts, alerts-preferences.spec.ts)
  await page.goto(siteUrl(slug, "/billets"));
  await page.getByLabel("Adresse e-mail").fill(`lea.${id}@exemple.be`);
  await page.getByRole("button", { name: "Recevoir mes liens" }).click();
  await expect(page.getByText("C’est envoyé.", { exact: false })).toBeVisible();
});
