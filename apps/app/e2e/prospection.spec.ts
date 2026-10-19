import { expect, test } from "./fixtures";
import * as OTPAuth from "otpauth";
import { appUrl, organizer, sql } from "./helpers";

const code = (secret: string, label: string) =>
  new OTPAuth.TOTP({ issuer: "Evoly", label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate();

test("prospection (back-office) : lot importé sans boîte active (en attente), doublon écarté, fiche d'un prospect : statut, relance, notes", async ({
  page,
}) => {
  const { id } = await organizer(page);
  sql(`update "User" set "platformRole" = 'ADMIN' where email = 'orga${id}@exemple.be'`);
  await page.goto(appUrl("/admin"));
  await page.waitForURL(/\/compte\/securite$/);
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Code").fill(code(secret, `orga${id}@exemple.be`));
  await page.getByRole("button", { name: "Activer la double authentification" }).click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(8);

  // import d'un lot : la même adresse deux fois, aucune boîte d'envoi active
  await page.goto(appUrl("/admin/prospection"));
  await expect(page.getByRole("heading", { name: "Prospection" })).toBeVisible();
  const organisation = `Salle ${id}`;
  const email = `contact.${id}@salle-exemple.be`;
  const lot = {
    lot: `essai-${id}`,
    emails: [
      { id: `a-${id}`, a: email, organisation, objet: "Votre billetterie", message: "Bonjour,\nUn mot sur Evoly." },
      { id: `b-${id}`, a: email.toUpperCase(), organisation, objet: "Votre billetterie", message: "Doublon." },
    ],
  };
  const actives = Number(sql(`select count(*) from "ProspectMailbox" where active`)); // la base peut déjà avoir des boîtes
  await page.getByLabel("Coller le lot JSON").fill(JSON.stringify(lot));
  await page.getByRole("button", { name: "Importer et envoyer" }).click();
  await expect(page.getByText(new RegExp(`1 e-mail\\(s\\) importé\\(s\\) dans le lot essai-${id}`))).toBeVisible();
  // sans boîte active, l'e-mail attend ; sinon il est programmé tout de suite
  if (actives === 0) await expect(page.getByText(/en attente \(aucune boîte active\)/)).toBeVisible();
  expect(sql(`select count(*) from "ProspectEmail" e join "Prospect" p on p.id = e."prospectId" where p.email = '${email}'`)).toBe("1");

  // boîtes d'envoi : la page et son formulaire d'ajout
  await page.goto(appUrl("/admin/prospection/boites"));
  await expect(page.getByRole("heading", { name: "Boîtes d'envoi" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ajouter une boîte" }).or(page.getByLabel("Ajouter une boîte"))).toBeVisible();

  // fiche du prospect : statut, date de relance et notes
  await page.goto(appUrl("/admin/prospection/prospects"));
  await page.getByRole("link", { name: organisation }).first().click();
  await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
  await page.getByRole("button", { name: "Intéressé", exact: true }).click();
  await expect.poll(() => sql(`select status from "Prospect" where email = '${email}'`)).toBe("INTERESSE");
  await page.locator('textarea[name="notes"]').fill("Rappeler jeudi");
  await page.locator('input[name="nextActionAt"]').fill("2026-10-22");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => sql(`select notes from "Prospect" where email = '${email}'`)).toBe("Rappeler jeudi");
  expect(sql(`select to_char("nextActionAt", 'YYYY-MM-DD') from "Prospect" where email = '${email}'`)).toBe("2026-10-22");
});
