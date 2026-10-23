import { expect, test } from "./fixtures";
import { organizer, publishedFreeEvent, sql } from "./helpers";

// compatibilité avec les réseaux de billetterie, de bout en bout (docs/COMPATIBILITE_RESEAUX.md) : un réseau, son contingent,
// l'import de ses billets en 1 clic, le scan d'un de ses codes-barres à la porte, et le bilan par canal
test.beforeEach(({}, testInfo) =>
  test.skip(testInfo.project.name !== "desktop", "un seul format suffit"),
);

test("réseau, contingent, import en 1 clic, scan d'un code-barres importé, bilan par canal", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { slug, id } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('sub_${id}', '${orgId}', 'pro', 'ACTIVE', now() + interval '60 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '60 days'`,
  );
  const eventUrl = await publishedFreeEvent(page, slug, `Gala ${id}`, 100);

  // un réseau et son contingent
  await page.goto(`${eventUrl}/distribution`);
  await page.getByRole("button", { name: "Ajouter le réseau" }).click();
  await expect(
    page.getByText("Ticketmaster", { exact: true }).first(),
  ).toBeVisible(); // dans la liste des réseaux et le formulaire du contingent
  const allocation = page.getByLabel("Ticketmaster", { exact: true });
  await allocation.fill("10");
  await page.getByRole("button", { name: "Enregistrer" }).first().click();
  await expect(
    page.getByText("90 places encore en vente en ligne"),
  ).toBeVisible();

  // import du fichier du réseau, en 1 clic
  await page.getByRole("button", { name: "Importer des billets" }).click();
  await page.getByLabel("Fichier du réseau").setInputFiles({
    name: "ticketmaster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `Code-barres;Nom;Tarif\nTM-${id}-1;Léa Martin;Fosse\nTM-${id}-2;Tom Dubois;Fosse\n`,
    ),
  });
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "2 billets ajoutés" }),
  ).toBeVisible();

  // à la porte : le code-barres du réseau passe au scanner, une seule fois
  // scanner ouvert depuis la page des entrées de l'événement (lien personnel de l'organisateur)
  await page.goto(`${eventUrl}/entries`);
  await page.getByRole("button", { name: "Ouvrir le scanner" }).click();
  await page.waitForURL(/scanner\.localhost:3001\/s\//);
  const code = page.getByPlaceholder("Code court");
  await code.fill(`TM-${id}-1`);
  await code.press("Enter");
  await expect(page.getByText("Entrée validée").first()).toBeVisible();
  await expect(page.getByText(/Léa Martin/).first()).toBeVisible();
  await page.waitForTimeout(1_700); // un scan à la fois
  await code.fill(`TM-${id}-1`);
  await code.press("Enter");
  await expect(page.getByText("Déjà scanné").first()).toBeVisible();

  // bilan par canal : le réseau, ses billets et son entrée
  await page.goto(`${eventUrl}/distribution`);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Ticketmaster" }) });
  await expect(row.getByRole("cell")).toHaveText(["2", "1", ""]);
});
