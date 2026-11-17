import { expect, test } from "./fixtures";
import { appUrl, organizer, siteUrl, sql } from "./helpers";

// Boutique, lot 3d (section 9.35) : livraison simple. Au paiement, retrait ou livraison (mode, adresse, frais ajoutés
// au total) ; payée (paiement simulé en base, Stripe absent des parcours) : adresse et frais sur la page de la commande,
// « Marquer expédiée » avec le suivi (e-mail à l'acheteur), puis le lien de suivi pour l'acheteur
test("boutique, livraison : mode et adresse au paiement, frais au total ; expédiée avec le suivi, e-mail et lien pour l'acheteur (US-SHOP-08, RG-SHOP-14, RG-SHOP-15)", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('sub_${id}', '${orgId}', 'pro', 'ACTIVE', now() + interval '60 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '60 days'`,
  );
  // un sweat à retirer ou à livrer (45 €, TVA 21 %), un lieu de retrait, un mode de livraison à 4,90 €
  sql(
    `insert into "PickupPoint" (id, "organizationId", name, address, "updatedAt") values ('pp${id}', '${orgId}', 'Accueil', 'Rue Haute 1, 1000 Bruxelles', now())`,
  );
  sql(
    `insert into "ShippingMethod" (id, "organizationId", name, "priceMinor", "updatedAt") values ('sm${id}', '${orgId}', 'Colis suivi', 490, now())`,
  );
  sql(
    `insert into "Product" (id, "organizationId", name, slug, "priceMinor", currency, "vatRateBps", status, "shippingEnabled", "updatedAt") values ('pr${id}', '${orgId}', 'Sweat ${id}', 'sweat-${id}', 4500, 'EUR', 2100, 'ON_SALE', true, now())`,
  );
  sql(
    `insert into "ProductVariant" (id, "productId", key, label, "priceDeltaMinor", stock, "sortOrder", "updatedAt") values ('vt${id}', 'pr${id}', '', '', 0, null, 0, now())`,
  );

  // page produit : « Livraison possible. » ; panier, puis « Commander »
  await page.goto(siteUrl(slug, `/boutique/sweat-${id}`));
  await expect(page.getByText("Livraison possible.")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await page.getByRole("link", { name: "Voir le panier (1)" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Votre panier" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Commander" }).click();
  await page.waitForURL(/\/boutique\/commande\/[A-Za-z0-9_-]{43}$/);
  const orderUrl = page.url();

  // retrait ou livraison : la livraison, ses frais ajoutés au total, l'adresse à saisir (pays de l'organisation)
  await expect(page.getByText("Retrait ou livraison ?")).toBeVisible();
  await expect(page.getByText("Sous-total")).toBeVisible();
  await page.getByText("Livraison", { exact: true }).click();
  await expect(page.getByText("Livraison · Colis suivi")).toBeVisible();
  await expect(page.getByText(/^49,90\s€$/)).toBeVisible();
  await expect(page.getByLabel("Destinataire")).toBeVisible();
  await expect(page.getByLabel("Pays")).toHaveValue("BE");

  // paiement simulé (aucun Stripe dans les parcours) : la commande payée, à livrer
  sql(
    `update "ShopOrder" set status = 'PAID', "paidAt" = now(), "holdExpiresAt" = null, "buyerFirstName" = 'Léa', "buyerLastName" = 'Martin', "buyerEmail" = 'lea.${id}@exemple.be', "fulfillmentMode" = 'SHIPPING', "shippingMethodId" = 'sm${id}', "shippingName" = 'Colis suivi', "shippingMinor" = 490, "shippingVatBps" = 2100, "totalMinor" = 4990, "vatMinor" = 866, "shipName" = 'Léa Martin', "shipAddress1" = 'Rue Basse 2', "shipPostalCode" = '1000', "shipCity" = 'Bruxelles', "shipCountry" = 'BE' where "organizationId" = '${orgId}'`,
  );
  sql(`update "ProductVariant" set held = 0, sold = 1 where id = 'vt${id}'`);
  await page.goto(orderUrl);
  await expect(
    page.getByRole("heading", { name: "Commande confirmée" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /^Code QR/ })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Livraison à" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Rue Basse 2\s+1000 Bruxelles\s+Belgique/),
  ).toBeVisible();
  await expect(
    page.getByText(/sera expédiée à l’adresse ci-dessous/),
  ).toBeVisible();
  await expect(page.getByText("Livraison · Colis suivi")).toBeVisible();

  // organisation : la fiche de la commande, son adresse, « Envoyer le suivi à l'acheteur »
  const trackingUrl = "https://track.example/CD123456789BE";
  await page.goto(appUrl(`/o/${slug}/shop?tab=orders`));
  await page.getByText("Léa Martin").first().click();
  await page.waitForURL(/\/shop\/orders\/c?[a-z0-9]+$/);
  await expect(page.getByText(/Rue Basse 2/)).toBeVisible();
  await page.getByLabel("Transporteur").fill("bpost");
  await page.getByLabel("Numéro de suivi").fill("CD123456789BE");
  await page.getByLabel("Lien de suivi").fill(trackingUrl);
  await page.getByRole("button", { name: /^Envoyer le suivi/ }).click();
  await expect
    .poll(() =>
      sql(
        `select count(*) from "EmailMessage" where "organizationId" = '${orgId}' and template = 'shop.order_shipped'`,
      ),
    )
    .toBe("1");
  await expect(page.getByText("Suivi : bpost, CD123456789BE")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ouvrir le suivi" }),
  ).toHaveAttribute("href", trackingUrl);
  await expect(page.getByLabel("Transporteur")).toHaveCount(0);

  // l'acheteur : expédiée, transporteur et numéro, « Suivre mon colis »
  await page.goto(orderUrl);
  await expect(page.getByText("Expédiée", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/avec bpost, numéro de suivi CD123456789BE/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Suivre mon colis" }),
  ).toHaveAttribute("href", trackingUrl);
});
