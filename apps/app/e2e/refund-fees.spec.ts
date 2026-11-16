import { expect, test } from "./fixtures";
import { appUrl, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("remboursement à coût neutre : réglages de l'organisation et de l'événement, règle affichée avant l'achat (RG-REF-09, RG-REF-11)", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);

  // Paramètres, Paiements : la valeur proposée aux nouveaux événements
  await page.goto(appUrl(`/o/${slug}/settings/payments`));
  await page
    .getByRole("combobox", { name: "Remboursements" })
    .selectOption("MINUS_FEES");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(
    page.getByText("Réglage enregistré pour vos prochains événements."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Remboursements" }),
  ).toHaveValue("MINUS_FEES");

  // un nouvel événement la reprend ; ses réglages de vente la montrent, sur demande
  const eventUrl = await publishedFreeEvent(page, slug, `Concert ${id}`, 10);
  const eventSlug = `concert-${id}`;
  sql(
    `update "TicketType" set "priceMinor" = 2000 where "eventId" = (select id from "Event" where slug = '${eventSlug}')`,
  ); // tarif payant : la règle ne concerne que les billets payants
  await page.goto(`${eventUrl}/settings/sales`);
  await page.getByRole("switch", { name: "Remboursement sur demande" }).check();
  const fees = page.getByLabel("Si l’acheteur demande un remboursement");
  await expect(fees).toHaveValue("MINUS_FEES");
  await expect(page.getByText(/Coût neutre pour vous/)).toBeVisible();
  // enregistrement automatique des réglages : attendu avant d'ouvrir la page publique
  await expect
    .poll(
      () =>
        sql(`select "refundPolicy" from "Event" where slug = '${eventSlug}'`),
      { timeout: 10_000 },
    )
    .toBe("ON_REQUEST");

  // page de l'événement : la règle avant l'achat
  await page.goto(siteUrl(slug, `/${eventSlug}`));
  await expect(
    page.getByText(
      "Les frais de paiement et de service ne sont pas remboursés.",
      { exact: false },
    ),
  ).toBeVisible();

  // l'organisateur passe en remboursement intégral : la page suit
  await page.goto(`${eventUrl}/settings/sales`);
  await page
    .getByLabel("Si l’acheteur demande un remboursement")
    .selectOption("FULL");
  await expect(page.getByText(/L’acheteur récupère tout/)).toBeVisible();
  await expect
    .poll(
      () =>
        sql(`select "refundFeeMode" from "Event" where slug = '${eventSlug}'`),
      { timeout: 10_000 },
    )
    .toBe("FULL");
  await page.goto(siteUrl(slug, `/${eventSlug}`));
  await expect(
    page.getByText("Le prix payé est remboursé en entier.", { exact: false }),
  ).toBeVisible();
});
