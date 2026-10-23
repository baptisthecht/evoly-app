import { createHmac } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { appUrl, organizer } from "./helpers";

// connexion avec double authentification, de bout en bout (RG-AUTH-04) : codes calculés comme une application d'authentification
test.beforeEach(({}, testInfo) =>
  test.skip(testInfo.project.name !== "desktop", "un seul format suffit"),
);

function base32(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/[\s=]/g, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
/** Code à usage unique (RFC 6238 : HMAC-SHA1, périodes de 30 secondes, 6 chiffres). */
function totp(secret: string, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  const n =
    ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

/** Code calculé au début d'une période : jamais à quelques secondes de son expiration (évite un code périmé). */
async function freshTotp(page: Page, secret: string) {
  const left = 30_000 - (Date.now() % 30_000);
  if (left < 6_000) await page.waitForTimeout(left + 200);
  return totp(secret);
}

test("double authentification : activée avec un code calculé, puis exigée à la connexion ; code faux refusé", async ({
  page,
}) => {
  const { id } = await organizer(page);
  const email = `orga${id}@exemple.be`;
  await page.goto(appUrl("/compte/securite"));
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page
    .locator('input[name="code"]')
    .first()
    .fill(await freshTotp(page, secret));
  await page
    .getByRole("button", { name: "Activer la double authentification" })
    .click();
  await expect(page.getByText("Vos codes de secours")).toBeVisible();

  await page.context().clearCookies();
  await page.goto(appUrl("/login"));
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("Motdepasse-2026!");
  await page.getByRole("button", { name: /connecter/i }).click();
  await page.waitForURL(/\/2fa/);
  const code = page.locator('input[name="code"]');
  await code.fill("000000");
  await page.getByRole("button", { name: "Valider" }).click();
  // code faux : le refus affiché (attendre la réponse avant de saisir le bon code), toujours sur la vérification
  await expect(page.locator('form [role="alert"]')).toBeVisible(); // l'alerte du formulaire (Next.js a aussi son annonceur)
  await expect(page).toHaveURL(/\/2fa/);
  await code.fill(await freshTotp(page, secret));
  await page.getByRole("button", { name: "Valider" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/2fa"));
  expect(new URL(page.url()).pathname).not.toMatch(/\/(login|2fa)/);
});
