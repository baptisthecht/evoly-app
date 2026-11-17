import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  buyFree,
  organizer,
  publishedFreeEvent,
  siteUrl,
  sql,
} from "./helpers";

/** Couleur d'accent et police des titres réellement appliquées à la page. */
const look = (page: Page) =>
  page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      accent: root.getPropertyValue("--accent").trim().toUpperCase(),
      display: root.getPropertyValue("--type-display").split(",")[0]!.trim(),
    };
  });

// Constaté le 17 novembre 2026 sur une organisation Partenaire qui n'avait jamais enregistré sa marque : le style propre à
// un événement (Apparence, « Personnaliser cet événement ») était ignoré, la billetterie restait aux couleurs d'Evoly.
// Il l'était aussi toujours sur l'adresse propre à l'événement et sur la page des billets.
test("style propre à un événement, sans marque enregistrée : sa page, son adresse propre et ses billets à ses couleurs et dans ses polices", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "updatedAt") values ('s_${orgId}', '${orgId}', 'partner', 'ACTIVE', now()) on conflict ("organizationId") do update set "planId" = 'partner', status = 'ACTIVE', "currentPeriodEnd" = null`,
  );
  const eventUrl = await publishedFreeEvent(page, slug, `Restaurant ${id}`, 10);
  const eventSlug = `restaurant-${id}`;
  expect(
    sql(
      `select count(*) from "OrganizationBrand" where "organizationId" = '${orgId}'`,
    ),
  ).toBe("0"); // marque jamais enregistrée

  // Apparence : style de la billetterie de cet événement, personnalisé
  await page.goto(`${eventUrl}/appearance`);
  await page
    .getByRole("radio", { name: "Personnaliser cet événement" })
    .check();
  await page.locator("#ev-primaryColor").fill("#000000");
  await page.locator("#ev-accentColor").fill("#FF6A00");
  await page.getByRole("combobox", { name: "Police des titres" }).click();
  await page.getByRole("option", { name: "Merriweather", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer le style" }).click();
  await expect(page.getByText("Style enregistré.")).toBeVisible();
  expect(
    sql(
      `select concat_ws(' ', "primaryColor", "accentColor", "headingFont") from "Event" where slug = '${eventSlug}'`,
    ),
  ).toBe("#000000 #FF6A00 merriweather");

  // page de l'événement, à l'adresse de l'organisation
  await page.goto(siteUrl(slug, `/${eventSlug}`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    `Restaurant ${id}`,
  );
  expect(await look(page)).toEqual({
    accent: "#FF6A00",
    display: "Merriweather",
  });

  // adresse propre à l'événement (sous-domaine d'événement)
  sql(
    `update "Event" set subdomain = 'resto-${id}' where slug = '${eventSlug}'`,
  );
  await page.goto(siteUrl(`resto-${id}`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    `Restaurant ${id}`,
  );
  expect(await look(page)).toEqual({
    accent: "#FF6A00",
    display: "Merriweather",
  });

  // page des billets après la réservation
  await buyFree(
    page,
    siteUrl(slug, `/${eventSlug}`),
    "Fosse",
    1,
    `lea.${id}@exemple.be`,
  );
  expect(await look(page)).toEqual({
    accent: "#FF6A00",
    display: "Merriweather",
  });
});
