import type { Browser, Frame, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { envValue, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

// paiements par carte de bout en bout, en mode test de Stripe (RG-PAY, RG-BUY-06 et 08).
// Actifs seulement avec les secrets de test : clé secrète, clé publique (à la construction) et un compte connecté de test.
const account = envValue("E2E_STRIPE_ACCOUNT");
test.describe.configure({ mode: "serial" }); // un seul compte connecté de test, rattaché tour à tour
test.beforeEach(({}, testInfo) => {
  test.skip(!account || !envValue("STRIPE_SECRET_KEY") || !envValue("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"), "clés Stripe de test absentes");
  test.skip(testInfo.project.name !== "desktop", "un seul format suffit");
  test.setTimeout(120_000);
});

/** Organisateur avec le compte connecté de test, événement publié à 12 €. */
async function paidEvent(page: Page) {
  const { slug, id } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(`delete from "StripeAccount" where "stripeAccountId" = '${account}'`);
  sql(
    `insert into "StripeAccount" (id, "organizationId", "stripeAccountId", country, "defaultCurrency", status, "chargesEnabled", "payoutsEnabled", "detailsSubmitted", "paymentDomains", "updatedAt") values ('sa_${id}', '${orgId}', '${account}', 'BE', 'EUR', 'ACTIVE', true, true, true, '{}', now())`,
  );
  const eventUrl = await publishedFreeEvent(page, slug, `Gala ${id}`, 100);
  const eventId = eventUrl.split("/").pop()!;
  sql(`update "TicketType" set "priceMinor" = 1200 where "eventId" = '${eventId}'`);
  return { eventId, publicUrl: siteUrl(slug, `/gala-${id}`), email: `acheteur.${id}@exemple.be` };
}

/** Cadre sécurisé de Stripe qui contient un champ donné (numéro de carte, validation 3-D Secure…). */
async function frameWith(page: Page, selector: string, timeout = 30_000): Promise<Frame> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const f of page.frames())
      if (
        await f
          .locator(selector)
          .count()
          .catch(() => 0)
      )
        return f;
    await page.waitForTimeout(400);
  }
  throw new Error(`cadre Stripe introuvable : ${selector}`);
}

async function payWith(page: Page, publicUrl: string, email: string, card: string) {
  await page.goto(publicUrl);
  const box = page.locator("#billets");
  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(email);
  const f = await frameWith(page, 'input[name="number"]');
  await f.locator('input[name="number"]').fill(card);
  await f.locator('input[name="expiry"]').pressSequentially("1234");
  await f.locator('input[name="cvc"]').pressSequentially("123");
  // pays proposé d'après l'adresse IP (la CI est aux États-Unis) : la Belgique, comme un acheteur belge
  const country = f.locator('select[name="country"]');
  if (await country.count()) await country.selectOption("BE");
  const zip = f.locator('input[name="postalCode"]');
  if ((await zip.count()) && (await zip.isVisible())) await zip.fill("1000");
  await box.getByRole("button", { name: /^Payer/ }).click();
}
/** Acheteur dans son propre navigateur : sans l'en-tête d'adresse IP simulée de l'organisateur, que les services de
 * Stripe (vérification anti-robots déclenchée sur une carte refusée, 3-D Secure) refusent. */
const buyerPage = async (browser: Browser) => (await browser.newContext({ locale: "fr-BE" })).newPage();
const orderOf = (email: string) => sql(`select status from "Order" where "buyerEmail" = '${email}' order by "createdAt" desc limit 1`);

test("carte acceptée : paiement confirmé au retour, commande payée, billets émis", async ({ page, browser }) => {
  const { publicUrl, email } = await paidEvent(page);
  const buyer = await buyerPage(browser);
  await payWith(buyer, publicUrl, email, "4242 4242 4242 4242");
  await buyer.waitForURL(/\/billets\/[A-Za-z0-9_-]{43}$/, { timeout: 60_000 });
  await expect.poll(() => orderOf(email), { timeout: 30_000 }).toBe("PAID");
  expect(Number(sql(`select count(*) from "Ticket" t join "Order" o on o.id = t."orderId" where o."buyerEmail" = '${email}'`))).toBe(1);
});

test("carte refusée : message clair, réservation et formulaire conservés", async ({ page, browser }) => {
  const { publicUrl, email } = await paidEvent(page);
  const buyer = await buyerPage(browser);
  await payWith(buyer, publicUrl, email, "4000 0000 0000 0002");
  await expect(
    page
      .locator("#billets")
      .getByRole("alert")
      .or(buyer.locator("#billets").getByText(/refusée|declined/i))
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(buyer.url()).not.toMatch(/\/billets\//);
  expect(orderOf(email)).toBe("PENDING");
  await expect(buyer.locator("#billets").getByLabel("Adresse e-mail")).toHaveValue(email);
});

test("3-D Secure : validation demandée puis acceptée, billets émis", async ({ page, browser }) => {
  const { publicUrl, email } = await paidEvent(page);
  const buyer = await buyerPage(browser);
  await payWith(buyer, publicUrl, email, "4000 0027 6000 3184");
  const challenge = await frameWith(buyer, "#test-source-authorize-3ds", 45_000);
  await challenge.locator("#test-source-authorize-3ds").click();
  await buyer.waitForURL(/\/billets\/[A-Za-z0-9_-]{43}$/, { timeout: 60_000 });
  await expect.poll(() => orderOf(email), { timeout: 30_000 }).toBe("PAID");
});
