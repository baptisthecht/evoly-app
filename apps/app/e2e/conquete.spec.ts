import { expect, test } from "@playwright/test";
import { appUrl, buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";
import { firstLink, lastEmail } from "./outbox";

/** Adresse publique d'un événement, d'après l'adresse de son tableau de bord. */
function publicPage(slug: string, eventUrl: string) {
  const eventId = eventUrl.split("/").pop()!;
  const eventSlug = sql(`select slug from "Event" where id = '${eventId}'`);
  return { eventId, eventSlug, url: siteUrl(slug, `/${eventSlug}`) };
}

test("liste d'attente : tarif complet, inscription, puis désinscription en un clic depuis l'e-mail (section 9.30) (RG-ATT-01, RG-ATT-05)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const ev = publicPage(slug, await publishedFreeEvent(page, slug, `Concert ${id}`, 1));
  await buyFree(page, ev.url, "Fosse", 1, `lea${id}@exemple.be`);

  await page.goto(ev.url);
  const box = page.locator("#billets");
  await expect(box.getByText("Complet")).toBeVisible();
  await box.getByRole("button", { name: "Rejoindre la liste d'attente" }).click();
  const email = `attente${id}@exemple.be`;
  await box.getByLabel("Votre e-mail").fill(email);
  await box.getByLabel("J'accepte d'être prévenu par e-mail dès qu'une place se libère.").check();
  await box.getByRole("button", { name: "M'inscrire" }).click();
  await expect(box.getByText("C'est noté : nous vous écrirons dès qu'une place se libère.")).toBeVisible();

  await page.goto(firstLink((await lastEmail(email, "waitlist.joined")).text));
  await page.getByRole("button", { name: "Quitter la liste d'attente" }).click();
  await expect(page.getByText("C'est fait : vous ne recevrez plus de message de cette liste d'attente.")).toBeVisible();
});

test("Pro : option sur la page de vente, table de 6, ambassadeur et sa page privée, billetterie intégrable limitée au site déclaré (sections 9.26 à 9.31) (RG-EMB-01, RG-EMB-02, RG-TAB-03, RG-AMB-02, RG-AMB-04)", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(`update "Subscription" set "planId" = 'pro', status = 'ACTIVE' where "organizationId" = '${orgId}'`); // passage en Pro simulé en base
  const eventUrl = await publishedFreeEvent(page, slug, `Gala ${id}`, 20);
  const ev = publicPage(slug, eventUrl);

  // option et consommation prépayée (section 9.29)
  await page.goto(`${eventUrl}/options`);
  await page.getByLabel("Nom").fill("Jeton boisson");
  await page.getByLabel("Prix").fill("3");
  await page.getByRole("button", { name: "Ajouter l'option" }).click();
  await expect(page.getByText("Option enregistrée.")).toBeVisible();

  // table de 6 (section 9.31)
  await page.goto(`${eventUrl}/tables`);
  await page.getByLabel("Personnes par table").fill("6");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Forfait enregistré.")).toBeVisible();

  await page.goto(ev.url);
  await expect(page.locator("#billets").getByText("Table pour 6 personnes")).toBeVisible();
  await expect(page.locator("#billets").getByText("Jeton boisson")).toBeVisible();

  // ambassadeur (section 9.28) : achat par son lien, ventes sur sa page privée
  await page.goto(`${eventUrl}/ambassadors`);
  await page.getByLabel("Nom").fill("Marie Dupont");
  await page.getByRole("button", { name: "Ajouter l'ambassadeur" }).click();
  await expect(page.getByText("Ambassadeur ajouté.")).toBeVisible();
  const code = sql(`select code from "Ambassador" where "eventId" = '${ev.eventId}'`);
  const statsToken = sql(`select "statsToken" from "Ambassador" where "eventId" = '${ev.eventId}'`);
  await buyFree(page, `${ev.url}?a=${code}`, "Fosse", 1, `client${id}@exemple.be`);
  await expect(page.getByText("Table 1")).toHaveCount(6); // une table : 6 billets, chacun avec sa table
  await page.goto(appUrl(`/ambassadeur/${statsToken}`));
  await expect(page.getByRole("heading", { name: "Vos ventes, Marie Dupont" })).toBeVisible();
  await expect(page.getByText("6", { exact: true }).first()).toBeVisible();

  // billetterie intégrable (section 9.26) : cadre autorisé seulement sur le site déclaré
  await page.goto(`${eventUrl}/embed`);
  await page.getByLabel("Ajouter un site").fill("monclub.be");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("https://monclub.be")).toBeVisible();
  const res = await page.request.get(appUrl(`/integre/${ev.eventId}`));
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors https://monclub.be");
  await page.goto(appUrl(`/integre/${ev.eventId}`));
  await expect(page.getByRole("heading", { name: `Gala ${id}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Réserver" })).toHaveAttribute("href", new RegExp(ev.eventSlug));
});

test("billetterie intégrable : la page qui ouvre la fenêtre d'achat apprend la commande terminée, sans donnée personnelle (RG-EMB-07)", async ({ page }) => {
  const { id, slug } = await organizer(page);
  const ev = publicPage(slug, await publishedFreeEvent(page, slug, `Salon ${id}`, 10));
  type Recu = { recu: unknown[] };
  await page.goto(siteUrl(slug, "/")); // la page d'origine : le site de l'organisateur
  await page.evaluate(() => {
    (window as unknown as Recu).recu = [];
    window.addEventListener("message", (e) => (window as unknown as Recu).recu.push(e.data));
  });
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.evaluate((u) => void window.open(u, "evoly-billetterie"), ev.url)]);
  await buyFree(popup, ev.url, "Fosse", 2, `salon${id}@exemple.be`);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Recu).recu))
    .toContainEqual({ type: "evoly:order_completed", tickets: 2, amountMinor: 0, currency: "EUR" });
  expect(JSON.stringify(await page.evaluate(() => (window as unknown as Recu).recu))).not.toContain("@"); // aucune adresse e-mail
});
