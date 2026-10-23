import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { appUrl, organizer, sql, uid } from "./helpers";

// écrans Pro qu'aucun parcours n'ouvrait encore : prévente, protection anti-robots, ambassadeurs
const fr = JSON.parse(
  readFileSync("../../packages/i18n/messages/fr.json", "utf8"),
) as Record<string, Record<string, string>>;
const [pre, amb, emb, seat, tab] = [
  fr.presale!,
  fr.ambassadors!,
  fr["embed"]!,
  fr.seatingEditor!,
  fr.tables!,
];
test.beforeEach(({}, testInfo) =>
  test.skip(
    testInfo.project.name !== "desktop",
    "un seul format suffit pour ces écrans",
  ),
);

/** Organisation Pro (offre active 30 jours) avec un brouillon d'événement ; renvoie l'adresse de l'événement. */
async function proDraft(page: import("@playwright/test").Page) {
  const { slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
  await page.goto(appUrl(`/o/${slug}/events/new`));
  await page.getByLabel("Titre").fill(`Concert ${uid()}`);
  await page.getByLabel("Nom du lieu").fill("La Madeleine");
  await page.getByLabel("Ville").fill("Bruxelles");
  await page.getByLabel("Nom du tarif").fill("Fosse");
  await page.getByLabel(/^Prix/).fill("0");
  await page.getByLabel("Quantité").fill("50");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(/\/events\/c[a-z0-9]{20,}$/);
  return page.url();
}

test("prévente (Pro) : codes créés, nombre annoncé, puis listés", async ({
  page,
}) => {
  const eventUrl = await proDraft(page);
  await page.goto(`${eventUrl}/launch`);
  await page.locator("#presaleQuantity").fill("3");
  await page.getByRole("button", { name: pre.generate }).click();
  await expect(page.getByText("3 codes créés.")).toBeVisible();
  await expect(page.getByText(pre.none!)).toHaveCount(0);
});

test("protection anti-robots (Pro) : activée, et toujours active après le rechargement", async ({
  page,
}) => {
  const eventUrl = await proDraft(page);
  await page.goto(`${eventUrl}/launch`);
  const bot = page.getByRole("checkbox", { name: /robots/i });
  await bot.check();
  await expect(bot).toBeChecked();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /robots/i })).toBeChecked();
});

test("ambassadeurs (Pro) : un ambassadeur est ajouté puis listé", async ({
  page,
}) => {
  const eventUrl = await proDraft(page);
  await page.goto(`${eventUrl}/ambassadors`);
  await page.locator("#amb-name").fill("Nora Ambassadrice");
  await page.getByRole("button", { name: amb.add }).click();
  await expect(page.getByText(amb.saved!)).toBeVisible();
  await expect(page.getByText("Nora Ambassadrice").first()).toBeVisible();
});

test("intégration sur un site : un site est déclaré, listé, puis retiré", async ({
  page,
}) => {
  const eventUrl = await proDraft(page);
  await page.goto(`${eventUrl}/embed`);
  await page.locator("#embed-origin").fill("monclub.be");
  await page.getByRole("button", { name: emb.add, exact: true }).click();
  await expect(page.getByText("monclub.be").first()).toBeVisible();
  await page.getByRole("button", { name: emb["remove"] }).first().click();
  await expect(page.getByText("https://monclub.be")).toHaveCount(0);
});

test("plan de salle (Pro) : un modèle est proposé, et « Théâtre » crée des places", async ({
  page,
}) => {
  const eventUrl = await proDraft(page);
  await page.goto(`${eventUrl}/seating`);
  await expect(page.getByText(seat.chooseTemplate!)).toBeVisible();
  await page
    .getByRole("radio", { name: new RegExp(seat.tpl_theatre!) })
    .check();
  await page.getByRole("button", { name: seat.generate, exact: true }).click();
  await expect(page.getByText(/\d+ places/).first()).toBeVisible({
    timeout: 20_000,
  });
});

test("tables (Pro) : un tarif devient une table de 6 personnes, enregistrement confirmé", async ({
  page,
}) => {
  const eventUrl = await proDraft(page);
  await page.goto(`${eventUrl}/tables`);
  await page.locator('input[id^="table-"][id$="-size"]').first().fill("6");
  await page
    .getByRole("button", { name: tab.save, exact: true })
    .first()
    .click();
  await expect(page.getByText(tab.saved!).first()).toBeVisible();
});
