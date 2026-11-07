import { expect, test } from "./fixtures";
import { appUrl, organizer, siteUrl, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test("création, aperçu, publication et page publique d'un événement gratuit", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const title = `Nuit Électrique ${id}`;
  const eventSlug = `nuit-electrique-${id}`;
  await page.goto(`/o/${slug}/events/new`);
  await page.getByLabel("Titre").fill(title);
  await page.getByLabel("Nom du lieu").fill("La Madeleine");
  await page.getByLabel("Ville").fill("Bruxelles");
  await page.getByLabel("Nom du tarif").fill("Fosse");
  await page.getByLabel(/^Prix/).fill("0");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(new RegExp(`/o/${slug}/events/c[a-z0-9]{20,}$`));
  const eventPath = page.url(); // adresse absolue : les pages publiques sont sur un autre hôte
  await expect(page.getByText("Brouillon", { exact: true })).toBeVisible();
  await expect(page.getByText("Avant de publier")).toBeVisible();

  // RG-EVT-03 : un brouillon n'est jamais public
  expect((await page.goto(siteUrl(slug, `/${eventSlug}`)))?.status()).toBe(404);

  // US-EVT-04 : aperçu du brouillon
  await page.goto(`${eventPath}/preview`);
  await expect(
    page.getByText("Aperçu : c’est la page que verront vos acheteurs.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: title }).last()).toBeVisible();
  await expect(page.getByText("Fosse")).toBeVisible();

  // publication : le billet gratuit ne demande pas Stripe
  await page.goto(eventPath);
  await page.getByRole("button", { name: "Publier" }).click();
  // le statut à côté du titre (sur téléphone, la pastille « En vente » est masquée, comme la maquette)
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "En vente",
  );
  // refonte A3 : les liens à partager sont dans Vente, Diffusion ; la vue d'ensemble suit la maquette
  await expect(page.getByRole("button", { name: "Publier" })).toHaveCount(0);

  const res = await page.goto(siteUrl(slug, `/${eventSlug}`));
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Gratuit").first()).toBeVisible();
  await expect(page.getByText("La Madeleine")).toBeVisible();
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(JSON.parse(jsonLd ?? "{}")["@type"]).toBe("Event");

  // RG-PUB-07 : la page de l'organisation liste l'événement
  await page.goto(siteUrl(slug));
  await expect(page.getByRole("heading", { name: title })).toBeVisible(); // titre de la carte (l'affiche dessinée le répète en décor)

  // RG-EVT-09 : lien court vers l'adresse canonique
  const code = sql(
    `select "publicCode" from "Event" where slug = '${eventSlug}'`,
  );
  await page.goto(appUrl(`/e/${code}`));
  await expect(page).toHaveURL(siteUrl(slug, `/${eventSlug}`));

  // RG-EVT-02 : pas de tarif payant sur un événement en vente sans Stripe
  await page.goto(`${eventPath}/tickets`);
  // refonte A3 (maquette « Tarifs ») : « Nouveau tarif » ouvre la fenêtre ; le net perçu est sous « Plus d'options »
  await page.getByRole("button", { name: "Nouveau tarif" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom du tarif").fill("VIP");
  await dialog.getByLabel("Prix").fill("45");
  await dialog.getByRole("button", { name: "Plus d’options" }).click();
  await expect(dialog.getByText(/Vous percevez environ 42,88/)).toBeVisible();
  await dialog.getByRole("button", { name: "Créer le tarif" }).click();
  await expect(
    page.getByText(
      "Connectez un compte Stripe actif pour vendre des billets payants.",
    ),
  ).toBeVisible();
});

test("tarif payant sur un brouillon : publication bloquée tant que Stripe n'est pas actif", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  await page.goto(`/o/${slug}/events/new`);
  await page.getByLabel("Titre").fill(`Concert ${id}`);
  await page.getByLabel("Nom du lieu").fill("Le Botanique");
  await page.getByLabel("Nom du tarif").fill("Plein tarif");
  await page.getByLabel(/^Prix/).fill("0,50");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(
    page.getByText("Un billet payant coûte au moins 1 €."),
  ).toBeVisible();
  await page.getByLabel(/^Prix/).fill("24,50");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(new RegExp(`/o/${slug}/events/c[a-z0-9]{20,}$`));
  await expect(
    page.getByRole("link", { name: "Connecter Stripe" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Publier" })).toHaveCount(0);
});

test("réglages en sauvegarde automatique, duplication et suppression d'un brouillon", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  await page.goto(`/o/${slug}/events/new`);
  await page.getByLabel("Titre").fill(`Atelier ${id}`);
  await page.getByLabel("Nom du lieu").fill("La Serre");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(new RegExp(`/o/${slug}/events/c[a-z0-9]{20,}$`));
  const eventPath = page.url(); // adresse absolue : les pages publiques sont sur un autre hôte

  await page.goto(`${eventPath}/settings`);
  await page.getByLabel("Titre").fill(`Atelier renommé ${id}`);
  await expect(
    page.getByRole("status").filter({ hasText: "Enregistré" }),
  ).toBeVisible({ timeout: 8000 });
  await page.reload();
  await expect(page.getByLabel("Titre")).toHaveValue(`Atelier renommé ${id}`);

  await page.goto(`${eventPath}/settings/advanced`); // dupliquer, supprimer, annuler : Réglages, Avancé
  await page.getByRole("button", { name: "Dupliquer" }).click();
  await expect(
    page.getByRole("heading", { name: `Atelier renommé ${id} (copie)` }),
  ).toBeVisible();
  await page.goto(`${page.url().replace(/\/$/, "")}/settings/advanced`);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Supprimer le brouillon" }).click();
  await page.waitForURL(`/o/${slug}/events`);
  await expect(page.getByText(`Atelier renommé ${id} (copie)`)).toHaveCount(0);
  await expect(page.getByText(`Atelier renommé ${id}`)).toBeVisible();
});

test("prix dynamiques : réservés au Pro, puis prix de prévente sur la page publique", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  await page.goto(`/o/${slug}/events/new`);
  await page.getByLabel("Titre").fill(`Festival ${id}`);
  await page.getByLabel("Nom du lieu").fill("Parc de Forest");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(new RegExp(`/o/${slug}/events/c[a-z0-9]{20,}$`));
  const eventPath = page.url(); // adresse absolue : les pages publiques sont sur un autre hôte

  // refonte A3 (maquette « Tarifs ») : un tarif s'ouvre d'un clic sur son nom, dans une fenêtre
  const openTariff = () =>
    page.getByRole("table").getByRole("button").first().click();
  await page.goto(`${eventPath}/tickets`);
  await openTariff();
  await expect(
    page.getByText("Prévente, tarif normal, dernière minute"),
  ).toBeVisible();

  // passage en Pro (abonnement actif) et compte Stripe actif, simulés en base
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `update "Subscription" set "planId" = 'pro', status = 'ACTIVE' where "organizationId" = '${orgId}'`,
  );
  sql(
    `insert into "StripeAccount" (id, "organizationId", "stripeAccountId", country, "defaultCurrency", status, "chargesEnabled", "payoutsEnabled", "detailsSubmitted", "updatedAt") values ('sa_${id}', '${orgId}', 'acct_test_${id}', 'BE', 'EUR', 'ACTIVE', true, true, true, now())`,
  );

  await page.reload();
  await openTariff();
  await page.getByLabel("Prix").first().fill("24");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await openTariff();
  await page.getByRole("button", { name: "Ajouter un palier" }).click();
  await page.getByLabel("Nom du palier").fill("Prévente");
  await page.getByLabel("Prix du palier").fill("18");
  await page.getByLabel("Premiers billets").fill("50");
  await page.getByRole("button", { name: "Enregistrer les paliers" }).click();
  await expect(page.getByText("Paliers enregistrés.")).toBeVisible();

  await page.goto(eventPath);
  await page.getByRole("button", { name: "Publier" }).click();
  // le statut à côté du titre (sur téléphone, la pastille « En vente » est masquée, comme la maquette)
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "En vente",
  );
  await page.goto(siteUrl(slug, `/festival-${id}`));
  await expect(page.getByText("Prévente")).toBeVisible();
  await expect(page.getByText(/^18\s€$/)).toBeVisible();
});
