import { expect, test } from "./fixtures";
import { organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

// Boutique, lot 3c (section 9.35) : un produit de la boutique en option d'un événement ; l'acheteur choisit la taille
// avec son billet ; la taille choisie est retenue sur le stock de la boutique
test("produit de la boutique en option d'un événement : proposé taille par taille, retenu sur le stock de la boutique (US-SHOP-07, RG-SHOP-13)", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('sub_${id}', '${orgId}', 'pro', 'ACTIVE', now() + interval '60 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '60 days'`,
  );
  sql(
    `insert into "Product" (id, "organizationId", name, slug, "priceMinor", currency, "vatRateBps", status, "updatedAt") values ('pr${id}', '${orgId}', 'T-shirt ${id}', 't-shirt-${id}', 2500, 'EUR', 2100, 'ON_SALE', now())`,
  );
  sql(
    `insert into "ProductOptionGroup" (id, "productId", name) values ('pg${id}', 'pr${id}', 'Taille')`,
  );
  sql(
    `insert into "ProductOptionValue" (id, "groupId", name, "sortOrder") values ('pvs${id}', 'pg${id}', 'S', 0), ('pvm${id}', 'pg${id}', 'M', 1)`,
  );
  sql(
    `insert into "ProductVariant" (id, "productId", key, label, "priceDeltaMinor", stock, "sortOrder", "updatedAt") values ('vs${id}', 'pr${id}', 'pvs${id}', 'S', 0, 2, 0, now()), ('vm${id}', 'pr${id}', 'pvm${id}', 'M', 200, null, 1, now())`,
  );
  const eventUrl = await publishedFreeEvent(page, slug, `Concert ${id}`, 10);

  // Billetterie, Options : « Produit de la boutique »
  await page.goto(`${eventUrl}/options`);
  await page.getByRole("button", { name: "Nouvelle option" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvelle option" });
  await dialog
    .getByLabel("Produit de la boutique")
    .selectOption({ value: `pr${id}` });
  await expect(dialog.getByLabel("Nom", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Ajouter l'option" }).click();
  await expect
    .poll(() =>
      sql(
        `select "productId" from "EventOption" where "eventId" = (select id from "Event" where slug = 'concert-${id}')`,
      ),
    )
    .toBe(`pr${id}`);

  // page de l'événement : une ligne par taille, au prix de la boutique ; un billet et un t-shirt M
  await page.goto(siteUrl(slug, `/concert-${id}`));
  const box = page.locator("#billets");
  await expect(box.getByText(`T-shirt ${id} (S)`)).toBeVisible();
  await expect(box.getByText(`T-shirt ${id} (M)`)).toBeVisible();
  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box
    .getByRole("button", { name: `T-shirt ${id} (M), un de plus` })
    .click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await expect(box.getByText(`1 × T-shirt ${id} (M)`)).toBeVisible();
  // la taille M est retenue sur le stock de la boutique
  expect(sql(`select held from "ProductVariant" where id = 'vm${id}'`)).toBe(
    "1",
  );
  expect(
    sql(
      `select concat_ws(':', "variantLabel", "unitPriceMinor", "unitFeeMinor") from "OrderOption" where "productVariantId" = 'vm${id}'`,
    ),
  ).toBe("M:2700:0");
});
