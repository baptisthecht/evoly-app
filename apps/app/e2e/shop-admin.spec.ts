import { expect, test } from "./fixtures";
import { appUrl, organizer, sql } from "./helpers";

// une photo de produit : un PNG d'un pixel (réduit et enregistré par l'import)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Boutique, lot 3a (section 9.35) : encart Pro en offre gratuite ; en Pro, un produit avec sa photo, ses tailles et leur
// stock, mis en vente une fois un lieu de retrait ajouté ; un mode de livraison
test("boutique : produit avec photo, tailles et stock, mis en vente après l'ajout d'un lieu de retrait (US-SHOP-01 à US-SHOP-03, RG-SHOP-01, RG-SHOP-05)", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  // offre gratuite : l'encart Pro, l'entrée de la barre latérale reste visible (pastille Pro)
  await page.goto(appUrl(`/o/${slug}/shop`));
  await expect(
    page.getByRole("heading", { name: "Boutique en ligne" }),
  ).toBeVisible();
  await expect(page.locator(`aside a[href="/o/${slug}/shop"]`)).toBeAttached();

  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('sub_${id}', '${orgId}', 'pro', 'ACTIVE', now() + interval '60 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '60 days'`,
  );
  await page.goto(appUrl(`/o/${slug}/shop`));
  await expect(page.getByText("Aucun produit pour l’instant")).toBeVisible();

  // nouveau produit : TVA proposée d'après le pays (Belgique, 21 %), puis sa fiche
  await page.getByRole("button", { name: "Nouveau produit" }).first().click();
  const create = page.getByRole("dialog", { name: "Nouveau produit" });
  await create.getByLabel(/^Nom/).fill(`T-shirt ${id}`);
  await create.getByLabel(/^Prix/).fill("25");
  await expect(create.getByLabel(/^TVA/)).toHaveValue("21");
  await create.getByRole("button", { name: "Créer le produit" }).click();
  await page.waitForURL(/\/shop\/products\/c[a-z0-9]{20,}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    `T-shirt ${id}`,
  );
  await expect(page.getByText("Brouillon", { exact: true })).toBeVisible();

  // une photo, importée puis ajoutée à la galerie
  await page.locator("#product-images").setInputFiles({
    name: "t-shirt.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(
    page.getByText("Photo principale", { exact: true }),
  ).toBeVisible();

  // tailles S et M : deux variantes, chacune son stock ; M avec un supplément
  await page.getByRole("button", { name: "Ajouter une option" }).click();
  await page.getByLabel("Nom de l’option").fill("Taille");
  const value = page.getByLabel("Ajouter une valeur");
  await value.fill("S");
  await value.press("Enter");
  await value.fill("M");
  await value.press("Enter");
  await expect(page.getByText("2 combinaisons")).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer les options" }).click();
  await expect(page.getByLabel("Stock : S")).toBeVisible();
  await page.getByLabel("Stock : S").fill("10");
  await page.getByLabel("Stock : M").fill("4");
  await page.getByLabel("Supplément : M").fill("2");
  await page.getByRole("button", { name: "Enregistrer le stock" }).click();
  await expect
    .poll(() =>
      sql(
        `select string_agg(concat_ws(':', label, stock, "priceDeltaMinor"), ',' order by label) from "ProductVariant" v join "Product" p on p.id = v."productId" where p.name = 'T-shirt ${id}' and v.active`,
      ),
    )
    .toBe("M:4:200,S:10:0");

  // mise en vente : il faut d'abord un lieu de retrait (RG-SHOP-05)
  const productUrl = page.url();
  await page.getByRole("button", { name: "Mettre en vente" }).click();
  await expect(
    page.getByText(
      "Ajoutez d’abord un lieu de retrait (onglet Retrait et livraison).",
    ),
  ).toBeVisible();

  // Retrait et livraison : un lieu, un mode de livraison
  await page.goto(appUrl(`/o/${slug}/shop?tab=delivery`));
  await page
    .getByRole("button", { name: "Ajouter un lieu de retrait" })
    .click();
  const point = page.getByRole("dialog", {
    name: "Ajouter un lieu de retrait",
  });
  await point.getByLabel(/^Nom du lieu/).fill("Accueil du théâtre");
  await point.getByLabel(/^Adresse/).fill("Rue Haute 1, 1000 Bruxelles");
  await point.getByRole("button", { name: "Ajouter" }).click();
  await expect(point).toHaveCount(0);
  await expect(page.getByText("Accueil du théâtre").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Ajouter un mode de livraison" })
    .click();
  const method = page.getByRole("dialog", {
    name: "Ajouter un mode de livraison",
  });
  await method.getByLabel(/^Mode de livraison/).fill("Colis suivi");
  await method.getByLabel(/^Prix/).fill("4,90");
  await method.getByRole("button", { name: "Ajouter" }).click();
  await expect(method).toHaveCount(0);
  await expect(page.getByText(/4,90\s€/).first()).toBeVisible();

  // le produit se met en vente ; le catalogue le montre, avec son prix « à partir de » et son stock
  await page.goto(productUrl);
  await page.getByRole("button", { name: "Mettre en vente" }).click();
  await expect(
    page.getByText("En vente", { exact: true }).first(),
  ).toBeVisible();
  await page.goto(appUrl(`/o/${slug}/shop`));
  await expect(page.getByText(`T-shirt ${id}`).first()).toBeVisible();
  await expect(page.getByText(/à partir de 25\s€/).first()).toBeVisible();
  await expect(page.getByText("14", { exact: true }).first()).toBeVisible();
});
