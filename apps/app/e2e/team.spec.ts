import { expect, test } from "@playwright/test";
import { firstLink, lastEmail } from "./outbox";
import { appUrl, organizer, sql } from "./helpers";

test("équipe : invitation, inscription de l'invité, adhésion automatique, rôle, retrait (section 9.3)", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
  const email = `sam.${id}@exemple.be`;

  // US-ORG-02 : invitation avec un rôle
  await page.goto(appUrl(`/o/${slug}/members`));
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Rôle", { exact: true }).selectOption({ label: "Contrôle des entrées" });
  await page.getByRole("button", { name: "Inviter", exact: true }).click();
  await expect(page.getByText("Invitation envoyée : elle est valable 48 heures.")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // RG-ORG-02 : sans compte, l'invité s'inscrit depuis le lien puis rejoint automatiquement
  const link = firstLink((await lastEmail(email, "member.invitation")).text);
  const guest = await browser.newContext({ locale: "fr-BE", extraHTTPHeaders: { "x-forwarded-for": `10.97.${Math.floor(Math.random() * 250)}.7` } });
  const g = await guest.newPage();
  await g.goto(link);
  await expect(g.getByRole("heading", { name: `Rejoindre Orga ${id}` })).toBeVisible();
  await g.getByRole("link", { name: "Créer mon compte" }).click();
  await expect(g.getByLabel("Adresse e-mail")).toHaveValue(email);
  await g.getByLabel("Votre nom").fill("Sam Martin");
  await g.getByLabel("Mot de passe").fill("Motdepasse-2026!");
  await g.getByRole("button", { name: "Créer mon compte" }).click();
  await g.waitForURL(/\/verify-email/);
  await g.goto(firstLink((await lastEmail(email, "account.verify_email")).text));
  await g.waitForURL(new RegExp(`/o/${slug}$`));
  await expect(g.getByRole("link", { name: "Finances" })).toHaveCount(0);
  await expect(g.getByRole("link", { name: "Abonnement" })).toHaveCount(0);

  // changement de rôle, puis retrait : l'accès disparaît aussitôt
  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: email });
  await row.getByLabel("Rôle", { exact: true }).selectOption({ label: "Lecture seule" });
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: email }).getByLabel("Rôle", { exact: true })).toHaveValue(
    sql(`select id from "Role" where "systemKey" = 'VIEWER'`),
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("listitem").filter({ hasText: email }).getByRole("button", { name: "Retirer" }).click();
  await expect(page.getByText(email)).toHaveCount(0);
  expect((await g.goto(appUrl(`/o/${slug}`)))?.status()).toBe(404);
  await guest.close();
});
