import { expect, test } from "./fixtures";
import {
  buyFree,
  organizer,
  publishedFreeEvent,
  siteUrl,
  sql,
} from "./helpers";

/** Abonnement Pro actif, posé en base (comme le parcours de la marque). */
function pro(slug: string) {
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
}
test.beforeEach(({}, testInfo) =>
  test.skip(testInfo.project.name !== "desktop", "un seul format suffit"),
);

// ambassadeurs (section 9.28, Pro) : chaque ambassadeur a son lien de vente (?a=CODE), la commande lui est attribuée
test("ambassadeurs : ajouté par l'organisateur, son lien de vente, la commande qui lui est attribuée", async ({
  page,
  browser,
}) => {
  const { slug, id } = await organizer(page);
  pro(slug);
  const eventUrl = await publishedFreeEvent(page, slug, `Gala ${id}`, 120);
  await page.goto(`${eventUrl}/ambassadors`);
  await page.locator("#amb-name").fill("Léa Ambassadrice");
  await page.getByRole("button", { name: "Ajouter l'ambassadeur" }).click();
  await expect(page.getByText("Léa Ambassadrice").first()).toBeVisible();
  const eventId = eventUrl.split("/").pop()!;
  const code = sql(
    `select code from "Ambassador" where "eventId" = '${eventId}'`,
  );
  expect(code).not.toBe("");

  // un acheteur arrive par le lien de l'ambassadeur et réserve 2 billets
  const buyer = await (await browser.newContext({ locale: "fr-BE" })).newPage();
  await buyFree(
    buyer,
    siteUrl(slug, `/gala-${id}?a=${code}`),
    "Fosse",
    2,
    `fan${id}@exemple.be`,
  );
  expect(
    sql(
      `select a.name from "Order" o join "Ambassador" a on a.id = o."ambassadorId" where o."buyerEmail" = 'fan${id}@exemple.be'`,
    ),
  ).toBe("Léa Ambassadrice");

  // un acheteur venu sans le lien : commande sans ambassadeur
  await buyFree(
    buyer,
    siteUrl(slug, `/gala-${id}`),
    "Fosse",
    1,
    `direct${id}@exemple.be`,
  );
  expect(
    sql(
      `select coalesce("ambassadorId", 'aucun') from "Order" where "buyerEmail" = 'direct${id}@exemple.be'`,
    ),
  ).toBe("aucun");
});
