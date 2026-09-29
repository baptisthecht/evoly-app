import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { appUrl, buyFree, envValue, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

/** Lien de désinscription signé comme le serveur (même secret que l'app de test). */
function unsubscribeLink(email: string, organizationId: string) {
  const secret = envValue("ORDER_TOKEN_SECRET") ?? envValue("BETTER_AUTH_SECRET")!;
  const payload = Buffer.from(JSON.stringify({ e: email, o: organizationId })).toString("base64url");
  return appUrl(`/desinscription/${payload}.${createHmac("sha256", `unsubscribe:${secret}`).update(payload).digest("base64url").slice(0, 32)}`);
}

test("contacts : consentement, export, désinscription en un clic sans connexion (US-MKT-04, US-MKT-05)", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Brocante ${id}`, 30);
  const email = `lea.${id}@exemple.be`;
  await buyFree(page, siteUrl(slug, `/brocante-${id}`), "Fosse", 1, email);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(`update "Contact" set "marketingConsent" = true, "consentAt" = now(), "consentSource" = 'CHECKOUT' where "organizationId" = '${orgId}'`);

  await page.goto(appUrl(`/o/${slug}/marketing`));
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("Accepte les actualités depuis le", { exact: false })).toBeVisible();
  const csv = await page.request.get(appUrl(`/o/${slug}/marketing/export`));
  expect(await csv.text()).toContain(`${email};Léa;Martin;fr;oui;`);

  const visitor = await browser.newContext({ locale: "fr-BE" });
  const v = await visitor.newPage();
  await v.goto(unsubscribeLink(email, orgId));
  await expect(v.getByText(`Adresse concernée : ${email}.`)).toBeVisible();
  await v.getByRole("button", { name: `Ne plus recevoir aucun e-mail de Orga ${id}` }).click();
  await expect(v.getByRole("heading", { name: "C’est fait" })).toBeVisible();
  await v.goto(unsubscribeLink(email, orgId).replace(/.{4}$/, "AAAA"));
  await expect(v.getByText("Ce lien de désinscription n’est pas valide.")).toBeVisible();
  await visitor.close();

  await page.goto(appUrl(`/o/${slug}/marketing?filter=UNSUBSCRIBED`));
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("Désinscrit le", { exact: false })).toBeVisible();
});
