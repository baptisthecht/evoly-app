import { expect, test } from "@playwright/test";
import { organizer, publishedFreeEvent, siteUrl } from "./helpers";

test("acheteur espagnol : page d'événement, commande et confirmation en espagnol, d'après la langue du navigateur", async ({ page, browser }) => {
  const { id, slug } = await organizer(page);
  await publishedFreeEvent(page, slug, `Fiesta ${id}`, 20);
  const ctx = await browser.newContext({ locale: "es-ES" });
  const guest = await ctx.newPage();
  await guest.goto(siteUrl(slug, `/fiesta-${id}`));
  await expect(guest.locator("html")).toHaveAttribute("lang", "es");
  const tickets = guest.locator("#billets");
  await expect(tickets.getByRole("heading", { name: "Entradas" })).toBeVisible();
  await tickets.getByRole("button", { name: /^Una entrada .+ más$/ }).first().click();
  await tickets.getByRole("button", { name: "Continuar" }).click();
  await expect(tickets.getByLabel("Dirección de e-mail")).toBeVisible();
  await tickets.getByLabel("Nombre", { exact: true }).fill("Ana");
  await tickets.getByLabel("Apellidos").fill("García");
  await tickets.getByLabel("Dirección de e-mail").fill(`ana.${id}@ejemplo.es`);
  await tickets.getByRole("button", { name: "Confirmar mi reserva" }).click();
  // page des billets, juste après l'achat : elle aussi en espagnol
  await guest.waitForURL(/\/billets\/[A-Za-z0-9_-]{43}$/);
  await expect(guest.getByRole("heading", { name: "Tus entradas" })).toBeVisible();
  await expect(guest.getByRole("img", { name: /^Código QR de la entrada / })).toHaveCount(1);
  await ctx.close();
});
