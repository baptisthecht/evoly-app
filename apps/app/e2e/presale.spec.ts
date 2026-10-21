import { expect, test } from "./fixtures";
import { buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

/** Abonnement Pro actif, posé en base (comme le parcours de la marque). */
function pro(slug: string) {
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
}
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "desktop", "un seul format suffit"));

// prévente privée (RG-PRV-01 et 02, Pro) : avant l'ouverture publique, l'accès aux billets passe par un code
test("prévente : code demandé avant l'ouverture publique, lien ?prevente=CODE puis achat, code épuisé ensuite", async ({ page, browser }) => {
  const { slug, id } = await organizer(page);
  pro(slug);
  const eventUrl = await publishedFreeEvent(page, slug, `Gala ${id}`, 120);
  const eventId = eventUrl.split("/").pop()!;
  // ventes publiques dans 10 jours, prévente déjà commencée
  sql(`update "Event" set "salesStartAt" = now() + interval '10 days', "presaleStartsAt" = now() - interval '1 hour' where id = '${eventId}'`);

  // un code à usage unique, créé par l'organisateur
  const code = `VIP${id}`;
  await page.goto(`${eventUrl}/launch`);
  await page.locator("#presaleQuantity").fill("1");
  await page.locator("#presaleUses").fill("1");
  await page.locator("#presaleCustom").fill(code);
  await page.getByRole("button", { name: "Créer les codes" }).click();
  await expect(page.getByText(code, { exact: false }).first()).toBeVisible();

  // sans code : la billetterie demande un code, pas d'achat possible
  const publicUrl = siteUrl(slug, `/gala-${id}`);
  const visitor = await (await browser.newContext({ locale: "fr-BE" })).newPage();
  await visitor.goto(publicUrl);
  await expect(visitor.getByText("Vous avez un code de prévente ?")).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Continuer" })).toHaveCount(0);

  // lien de prévente : l'accès s'ouvre, la page se recharge sans le code, l'achat passe
  await visitor.goto(`${publicUrl}?prevente=${code}`);
  await visitor.waitForURL((u) => !u.search.includes("prevente"));
  await expect(visitor.getByText(/Prévente privée : vous avez accès aux billets/)).toBeVisible();
  await buyFree(visitor, publicUrl, "Fosse", 1, `vip${id}@exemple.be`);
  expect(sql(`select upper(p.code) from "Order" o join "PresaleCode" p on p.id = o."presaleCodeId" where o."buyerEmail" = 'vip${id}@exemple.be'`)).toBe(
    code.toUpperCase(),
  );

  // code à usage unique, déjà utilisé : un autre visiteur n'a pas accès aux billets
  const other = await (await browser.newContext({ locale: "fr-BE" })).newPage();
  await other.goto(`${publicUrl}?prevente=${code}`);
  await expect(other.getByText(/Prévente privée : vous avez accès aux billets/)).toHaveCount(0);
  await other.goto(publicUrl);
  await expect(other.getByRole("button", { name: "Continuer" })).toHaveCount(0);
});
