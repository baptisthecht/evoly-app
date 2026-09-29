import { expect, test } from "@playwright/test";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("connexion avec Google : le bouton mène à l'autorisation Google (US-AUTH-02)", async ({ browser }) => {
  const p = await (await browser.newContext({ locale: "fr-BE" })).newPage();
  await p.goto(appUrl("/login?next=/acces-scanner"));
  const google = p.waitForRequest((r) => /accounts\.google\.com\/o\/oauth2/.test(r.url()));
  await p.getByRole("button", { name: "Continuer avec Google" }).click();
  const req = await google;
  expect(new URL(req.url()).searchParams.get("client_id")).toBe("evoly-test.apps.googleusercontent.com");
  await expect(p.getByRole("button", { name: "Continuer avec Apple" })).toHaveCount(0); // Apple non configuré : pas de bouton
});

test("limite de billets par adresse e-mail (RG-BUY-09)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Brocante ${id}`, 30);
  sql(`update "Event" set "maxTicketsPerBuyer" = 2 where slug = 'brocante-${id}'`);
  const url = siteUrl(slug, `/brocante-${id}`);
  await buyFree(page, url, "Fosse", 2, `lea.${id}@exemple.be`);
  await page.goto(url);
  const box = page.locator("#billets");
  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(`LEA.${id}@exemple.be`);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await expect(box.getByText("Cette adresse a atteint le nombre maximum de billets pour cet événement.")).toBeVisible();
});

test("inscription venue du site par « ?plan=pro » : l'essai Pro est proposé après l'onboarding (RG-AUTH-08)", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "fr-BE", extraHTTPHeaders: { "x-forwarded-for": `10.61.${Math.floor(Math.random() * 250)}.6` } });
  const p = await ctx.newPage();
  await p.goto(appUrl("/register?plan=pro"));
  const { slug } = await organizer(p);
  await p.goto(appUrl(`/onboarding/payments?org=${slug}`));
  await expect(p.locator(`a[href="/o/${slug}/billing?essai=1"]`)).toHaveCount(1);
  await ctx.close();
});
