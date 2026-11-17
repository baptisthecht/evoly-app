import { expect, test } from "./fixtures";
import { appUrl, organizer, siteUrl, sql } from "./helpers";

// Boutique publique, lot 3b (section 9.35) : section « Boutique » de la page de l'organisation, page produit, panier,
// commande retenue pendant le paiement ; payée (paiement simulé en base, Stripe absent des parcours) : code QR de
// retrait, reçu avec la TVA, commande prête puis remise au code, rétractation
test("boutique publique : produit, panier, commande retenue ; payée : code QR et reçu, prête, remise au code, rétractation (US-SHOP-04 à US-SHOP-06, RG-SHOP-07, RG-SHOP-09 à RG-SHOP-11)", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('sub_${id}', '${orgId}', 'pro', 'ACTIVE', now() + interval '60 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '60 days'`,
  );
  // un t-shirt en vente (S : 2 en stock, M : sans limite et 2 € de plus), un lieu de retrait
  sql(
    `insert into "PickupPoint" (id, "organizationId", name, address, instructions, "updatedAt") values ('pp${id}', '${orgId}', 'Accueil du théâtre', 'Rue Haute 1, 1000 Bruxelles', 'Du mardi au samedi', now())`,
  );
  sql(
    `insert into "Product" (id, "organizationId", name, slug, description, "priceMinor", currency, "vatRateBps", status, "updatedAt") values ('pr${id}', '${orgId}', 'T-shirt ${id}', 't-shirt-${id}', 'Coton bio, coupe droite.', 2500, 'EUR', 2100, 'ON_SALE', now())`,
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

  // page de l'organisation : la section « Boutique »
  await page.goto(siteUrl(slug));
  await expect(page.getByRole("heading", { name: "Boutique" })).toBeVisible();
  await page.getByRole("link", { name: "Voir la boutique" }).click();
  await expect(page).toHaveURL(siteUrl(slug, "/boutique"));
  await page.getByRole("link", { name: new RegExp(`T-shirt ${id}`) }).click();

  // page produit : taille M, 27 €, ajoutée au panier
  await expect(
    page.getByRole("heading", { level: 1, name: `T-shirt ${id}` }),
  ).toBeVisible();
  await page.getByText("M", { exact: true }).click();
  await expect(page.getByText(/^27\s€$/)).toBeVisible();
  await expect(
    page.getByText("Droit de rétractation de 14 jours."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await page.getByRole("link", { name: "Voir le panier (1)" }).click();

  // panier relu par le serveur, puis « Commander » : la commande est retenue pendant le paiement
  await expect(
    page.getByRole("heading", { level: 1, name: "Votre panier" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: `T-shirt ${id}` })).toBeVisible();
  await page.getByRole("button", { name: "Commander" }).click();
  await page.waitForURL(/\/boutique\/commande\/[A-Za-z0-9_-]{43}$/);
  const orderUrl = page.url();
  await expect(
    page.getByText(/Vos produits sont réservés encore/),
  ).toBeVisible();
  await expect(page.getByText("Accueil du théâtre")).toBeVisible();
  await expect(page.getByText("dont TVA 21 %")).toBeVisible();
  expect(sql(`select held from "ProductVariant" where id = 'vm${id}'`)).toBe(
    "1",
  );

  // paiement simulé (aucun Stripe dans les parcours) : la commande payée, à retirer à l'accueil
  sql(
    `update "ShopOrder" set status = 'PAID', "paidAt" = now(), "holdExpiresAt" = null, "buyerFirstName" = 'Léa', "buyerLastName" = 'Martin', "buyerEmail" = 'lea.${id}@exemple.be', "pickupPointId" = 'pp${id}', "pickupName" = 'Accueil du théâtre', "pickupAddress" = 'Rue Haute 1, 1000 Bruxelles' where "organizationId" = '${orgId}'`,
  );
  sql(`update "ProductVariant" set held = 0, sold = 1 where id = 'vm${id}'`);
  await page.goto(orderUrl);
  await expect(
    page.getByRole("heading", { name: "Commande confirmée" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Code QR de retrait/ }),
  ).toBeVisible();
  await expect(page.getByText("En préparation")).toBeVisible();
  const code = sql(
    `select "pickupCode" from "ShopOrder" where "organizationId" = '${orgId}'`,
  );

  // organisation : l'onglet Commandes, la fiche, « Prête à retirer » (e-mail à l'acheteur)
  await page.goto(appUrl(`/o/${slug}/shop?tab=orders`));
  await page.getByText("Léa Martin").first().click();
  await page.waitForURL(/\/shop\/orders\/c?[a-z0-9]+$/);
  await page.getByRole("button", { name: "Prête à retirer" }).click();
  await expect
    .poll(() =>
      sql(
        `select count(*) from "EmailMessage" where "organizationId" = '${orgId}' and template = 'shop.order_ready'`,
      ),
    )
    .toBe("1");

  // retrait : le code saisi, la commande remise une seule fois
  await page.goto(appUrl(`/o/${slug}/shop/pickup`));
  await page.getByLabel("Code de retrait").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Retrouver" }).click();
  await expect(page.getByText("1 × T-shirt")).toBeVisible();
  await page.getByRole("button", { name: "Remettre la commande" }).click();
  await expect(page.getByRole("status")).toContainText("remise");

  // l'acheteur : retirée, et la rétractation encore ouverte 14 jours
  await page.goto(orderUrl);
  await expect(page.getByText("Retirée", { exact: true })).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Je me rétracte" }).click();
  await expect(page.getByText(/Rétractation demandée le/)).toBeVisible();
});
