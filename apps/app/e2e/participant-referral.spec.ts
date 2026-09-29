import { expect, test } from "@playwright/test";
import { lastEmail } from "./outbox";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

test("espace participant : lien de connexion, billets, préférences (section 9.23)", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Récital ${id}`, 20);
  const email = `lea.${id}@exemple.be`;
  await buyFree(page, siteUrl(slug, `/recital-${id}`), "Fosse", 1, email);
  const ctx = await browser.newContext({ locale: "fr-BE", extraHTTPHeaders: { "x-forwarded-for": `10.63.${Math.floor(Math.random() * 250)}.2` } });
  const p = await ctx.newPage();
  await p.goto(appUrl("/mon-espace"));
  await p.getByLabel("Adresse e-mail").fill(email);
  await p.getByRole("button", { name: "Recevoir mon lien" }).click();
  await expect(p.getByText("un lien de connexion vient d’être envoyé", { exact: false })).toBeVisible();
  const link = /(http:\/\/\S+\/mon-espace\/connexion\/\S+)/.exec((await lastEmail(email, "participant.magic_link")).text)![1]!;
  await p.goto(link);
  await p.waitForURL(/\/mon-espace$/);
  await expect(p.getByText(`Connecté avec ${email}`)).toBeVisible();
  await expect(p.getByRole("region", { name: "À venir" }).getByText(`Récital ${id}`)).toBeVisible();
  const prefs = p.getByRole("region", { name: "Mes e-mails" });
  await prefs.getByRole("button", { name: "Recevoir ses actualités" }).click();
  await expect(prefs.getByText("Vous recevez ses actualités.")).toBeVisible();
  await ctx.close();
});

test("parrainage : inscription par le lien, organisation rattachée au parrain (section 9.22)", async ({ page, browser }) => {
  const { slug } = await organizer(page);
  await page.goto(appUrl(`/o/${slug}/billing`));
  const link = await page.getByTestId("referral-link").inputValue();
  expect(link).toMatch(/\/register\?ref=[a-z0-9]{8}$/);
  const ctx = await browser.newContext({ locale: "fr-BE", extraHTTPHeaders: { "x-forwarded-for": `10.62.${Math.floor(Math.random() * 250)}.4` } });
  const guest = await ctx.newPage();
  await guest.goto(appUrl(link.slice(link.indexOf("/register")))); // le code est mémorisé à l'arrivée
  const { slug: child } = await organizer(guest);
  expect(sql(`select r.status from "Referral" r join "Organization" o on o.id = r."referredOrgId" where o.slug = '${child}'`)).toBe("SIGNED_UP");
  await ctx.close();
});
