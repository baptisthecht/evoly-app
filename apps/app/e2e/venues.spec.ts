import { expect, test } from "./fixtures";
import { appUrl, organizer, sql } from "./helpers";

test("lieu partenaire : le lieu active le programme et renseigne sa salle ; l'organisateur inscrit par son lien y est rattaché, et sa salle lui est proposée d'office (section 9.32)", async ({
  page,
  browser,
}) => {
  const { slug } = await organizer(page);
  await page.goto(appUrl(`/o/${slug}/billing?tab=venue`));
  await page.getByRole("button", { name: "Devenir lieu partenaire" }).click();
  await expect(
    page.getByRole("button", { name: "J'accepte l'autofacturation" }),
  ).toBeVisible(); // la carte du lieu, une fois le programme activé
  await page.getByLabel("Nom de la salle").fill("Le Hangar");
  await page.getByLabel("Adresse", { exact: true }).fill("Rue du Port 12");
  await page.getByLabel("Code postal").fill("1000");
  await page.getByLabel("Ville").fill("Bruxelles");
  await page.getByRole("button", { name: "Enregistrer" }).first().click();
  const venue = `select v.id from "VenuePartner" v join "Organization" o on o.id = v."organizationId" where o.slug = '${slug}'`;
  await expect
    .poll(() =>
      sql(`select "addressLine1" from "VenuePartner" where id = (${venue})`),
    )
    .toBe("Rue du Port 12");
  const code = sql(`select code from "VenuePartner" where id = (${venue})`);

  // un organisateur arrive par le lien du lieu, puis s'inscrit
  const autre = await browser.newContext({ locale: "fr-BE" });
  const orga = await autre.newPage();
  await orga.goto(appUrl(`/register?lieu=${code}`));
  const o2 = await organizer(orga);
  expect(
    sql(
      `select "referredByVenueId" from "Organization" where slug = '${o2.slug}'`,
    ),
  ).toBe(sql(venue));
  await orga.goto(appUrl(`/o/${o2.slug}/billing`));
  await expect(orga.getByText(/Vous êtes rattaché à Le Hangar/)).toBeVisible();
  // à la création d'un événement, la salle est proposée d'office ; décochée, l'adresse réapparaît
  await orga.goto(appUrl(`/o/${o2.slug}/events/new`));
  const caseSalle = orga.getByLabel(/Cet événement a lieu à Le Hangar/);
  await expect(caseSalle).toBeChecked();
  await expect(orga.getByText("Rue du Port 12, 1000 Bruxelles")).toBeVisible();
  await caseSalle.uncheck();
  await expect(orga.locator("#addressLine1")).toBeVisible();
});
