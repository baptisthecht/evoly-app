import { expect, test } from "./fixtures";
import {
  appUrl,
  buyFree,
  organizer,
  publishedFreeEvent,
  siteUrl,
  sql,
} from "./helpers";
import { lastEmail } from "./outbox";

test("éditeur d'e-mails : mise en forme, bouton, aperçu en temps réel, bloc HTML nettoyé, enregistrement", async ({
  page,
}) => {
  const { slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
  await page.goto(appUrl(`/o/${slug}/marketing/campaigns/new?template=blank`));
  const editor = page.getByRole("textbox", { name: "Contenu de l'e-mail" });
  const preview = page.frameLocator(`iframe[title="Aperçu de l'e-mail"]`);

  // texte en gras : visible dans l'aperçu, sans rien enregistrer
  // curseur à la fin du dernier paragraphe, par un clic au bout de sa dernière ligne, comme un utilisateur : les
  // raccourcis « fin du document » changent d'un système à l'autre (Ctrl+Fin, Cmd+Flèche bas). Le clic qui donne le
  // focus à l'éditeur peut voir ProseMirror remettre son curseur au début du document (sa sélection rétablie avant
  // la lecture de celle du clic) : on reclique tant que la barre n'affiche pas le style du paragraphe (« Texte »)
  const last = editor.locator("p").last();
  const style = page.getByRole("combobox", { name: "Style du texte" });
  await expect(async () => {
    const box = (await last.boundingBox())!;
    await last.click({ position: { x: box.width - 1, y: box.height - 1 } });
    await expect(style).toHaveValue("p", { timeout: 1000 });
  }).toPass();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Texte important");
  // le paragraphe sélectionné d'un triple clic, une fois l'aperçu à jour, puis mis en gras
  await expect(preview.getByText("Texte important")).toBeVisible();
  await editor
    .getByText("Texte important", { exact: true })
    .click({ clickCount: 3 });
  await page.getByRole("button", { name: "Gras" }).click();
  await expect(
    preview.locator("strong", { hasText: "Texte important" }),
  ).toBeVisible();

  // bouton réglé dans le panneau
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Bouton", exact: true }).click();
  await page.locator(".email-atom--button").click();
  await page.getByLabel("Texte du bouton").fill("Je réserve");
  await page.getByLabel("Adresse du bouton").fill("https://evoly.me/gala");
  await expect(
    preview.getByRole("link", { name: "Je réserve" }),
  ).toHaveAttribute("href", "https://evoly.me/gala");

  // bloc HTML piégé : le code dangereux est retiré, l'utilisateur est prévenu
  await page.getByRole("button", { name: "HTML", exact: true }).click();
  await page.locator(".email-atom--html").click();
  await page
    .getByLabel("Code HTML")
    .fill(
      '<p>Bloc maison</p><script>alert(1)</script><img src="https://exemple.be/a.png" onerror="alert(2)">',
    );
  await expect(preview.getByText("Bloc maison")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("scripts");
  await expect(page.getByRole("status")).toContainText(
    "gestionnaires d'événements",
  );
  expect(await preview.locator("script").count()).toBe(0);
  expect(await preview.locator("[onerror]").count()).toBe(0);

  // enregistré au nouveau format, retrouvé après rechargement
  await page.getByLabel("Nom de la campagne").fill("Gala de printemps");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForURL(/\/marketing\/campaigns\/c[a-z0-9]{20,}$/);
  await page.reload();
  await expect(
    editor.locator("strong", { hasText: "Texte important" }),
  ).toBeVisible();
  await expect(editor.locator(".email-atom--button")).toContainText(
    "Je réserve",
  );
  const stored = sql(
    `select content::text from "EmailCampaign" where "organizationId" = '${orgId}' order by "createdAt" desc limit 1`,
  );
  const doc = JSON.parse(stored) as {
    type: string;
    content: Array<{ type: string; attrs?: Record<string, string> }>;
  };
  expect(doc.type).toBe("doc");
  expect(doc.content.find((b) => b.type === "button")?.attrs).toMatchObject({
    label: "Je réserve",
    href: "https://evoly.me/gala",
  });
  const html = doc.content.find((b) => b.type === "rawHtml")?.attrs?.html ?? "";
  expect(html).toContain("<p>Bloc maison</p>");
  expect(html).not.toMatch(/<script|onerror/i);
});

test("bloc personnalisé de l'e-mail des billets : écrit par l'organisateur, reçu par l'acheteur", async ({
  page,
}) => {
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Concert ${id}`, 20);
  await page.goto(`${eventUrl}/emails`);
  const block = page.getByRole("region", { name: "E-mail des billets" });
  await block.getByRole("textbox", { name: "Contenu de l'e-mail" }).click();
  await page.keyboard.type("Parking gratuit rue des Lilas");
  await block.getByRole("button", { name: "Enregistrer le message" }).click();
  await expect(block.getByText("Message enregistré.")).toBeVisible();
  const buyer = `lea.${id}@exemple.be`;
  await buyFree(page, siteUrl(slug, `/concert-${id}`), "Fosse", 1, buyer);
  expect((await lastEmail(buyer, "order.confirmation")).text).toContain(
    "Parking gratuit rue des Lilas",
  );
});
