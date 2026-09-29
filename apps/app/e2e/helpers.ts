import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { firstLink, lastEmail } from "./outbox";

export const uid = () => `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

/** Requête SQL directe sur la base de test (préparation de cas : passage en Pro…). */
export function sql(query: string): string {
  const url = process.env.DATABASE_URL ?? "postgresql://evoly:evoly@localhost:5432/evoly";
  return execFileSync("psql", [url, "-tAc", query], { encoding: "utf8" }).trim();
}

export const baseDomain = () => process.env.E2E_BASE_DOMAIN ?? "localhost:3001";
export const siteUrl = (sub: string, path = "") => `http://${sub}.${baseDomain()}${path}`;
export const appUrl = (path: string) => new URL(path, process.env.E2E_BASE_URL ?? "http://localhost:3001").toString();

/** Adresse IP propre à chaque test : les limites anti-abus s'appliquent par adresse. */
const randomIp = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;

export async function signUpAndVerify(page: Page, email: string, password = "Motdepasse-2026!") {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  await page.goto("/register");
  await page.getByLabel("Votre nom").fill("Camille Dupont");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(/\/verify-email/);
  await page.goto(firstLink((await lastEmail(email, "account.verify_email")).text));
  await page.waitForURL(/\/onboarding/);
}

export async function createOrganization(page: Page, name: string, slug: string) {
  await page.getByLabel("Nom de l’organisation").fill(name);
  await page.locator("#subdomain").fill(slug);
  await expect(page.getByText("Cette adresse est disponible.")).toBeVisible();
  await page.locator("input[name=terms]").check();
  await page.getByRole("button", { name: "Créer mon organisation" }).click();
  await page.waitForURL(new RegExp(`/onboarding/payments\\?org=${slug}`));
}

/** Compte vérifié avec une organisation Free prête, sur son tableau de bord. */
export async function organizer(page: Page) {
  const id = uid();
  const slug = `orga-${id}`;
  await signUpAndVerify(page, `orga${id}@exemple.be`);
  await createOrganization(page, `Orga ${id}`, slug);
  await page.goto(`/o/${slug}`);
  return { id, slug };
}

/** Événement gratuit publié, avec un tarif « Fosse » de la quantité donnée. Renvoie l'adresse du tableau de bord. */
export async function publishedFreeEvent(page: Page, slug: string, title: string, quantity: number) {
  await page.goto(appUrl(`/o/${slug}/events/new`));
  await page.getByLabel("Titre").fill(title);
  await page.getByLabel("Nom du lieu").fill("La Madeleine");
  await page.getByLabel("Ville").fill("Bruxelles");
  await page.getByLabel("Nom du tarif").fill("Fosse");
  await page.getByLabel(/^Prix/).fill("0");
  await page.getByLabel("Quantité").fill(String(quantity));
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.waitForURL(/\/events\/c[a-z0-9]{20,}$/);
  const eventUrl = page.url();
  await page.getByRole("button", { name: "Publier" }).click();
  await expect(page.getByText("Liens à partager")).toBeVisible();
  return eventUrl;
}

/** Achat gratuit depuis la page publique : quantité du premier tarif, coordonnées, confirmation. */
export async function buyFree(page: Page, eventPageUrl: string, ticketName: string, quantity: number, email: string) {
  await page.goto(eventPageUrl);
  const box = page.locator("#billets");
  for (let i = 0; i < quantity; i++) await box.getByRole("button", { name: `Un billet ${ticketName} de plus` }).click();
  await box.getByRole("button", { name: "Continuer" }).click();
  await box.getByLabel("Prénom").first().fill("Léa");
  await box.getByLabel("Nom", { exact: true }).fill("Martin");
  await box.getByLabel("Adresse e-mail").fill(email);
  await box.getByRole("button", { name: "Confirmer ma réservation" }).click();
  await page.waitForURL(/\/billets\/[A-Za-z0-9_-]{43}$/);
}
