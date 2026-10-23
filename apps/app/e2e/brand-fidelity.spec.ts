import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

// fidélité de la personnalisation (RG-BRD-01) : sur la billetterie, du haut de la page jusqu'au panier, chaque texte visible
// s'affiche dans la police choisie (titres : police des titres ; tout le reste : police du texte), police réellement chargée ;
// bouton principal à la couleur et à l'arrondi choisis
test.beforeEach(({}, testInfo) =>
  test.skip(testInfo.project.name !== "desktop", "un seul format suffit"),
);

type Brand = {
  headingFont: string;
  bodyFont: string;
  accentColor: string;
  radius: string;
};
/** Organisation Pro personnalisée, événement gratuit publié ; renvoie l'adresse publique de l'événement. */
async function brandedEvent(page: Page, brand: Brand) {
  const { slug, id } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('sub_${id}', '${orgId}', 'pro', 'ACTIVE', now() + interval '60 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '60 days'`,
  );
  sql(
    `insert into "OrganizationBrand" (id, "organizationId", "headingFont", "bodyFont", "accentColor", radius, "updatedAt") values ('br_${id}', '${orgId}', '${brand.headingFont}', '${brand.bodyFont}', '${brand.accentColor}', '${brand.radius}', now()) on conflict ("organizationId") do update set "headingFont" = excluded."headingFont", "bodyFont" = excluded."bodyFont", "accentColor" = excluded."accentColor", radius = excluded.radius`,
  );
  await publishedFreeEvent(page, slug, `Gala ${id}`, 100);
  return siteUrl(slug, `/gala-${id}`);
}
const visitor = async (browser: Browser) =>
  (await browser.newContext({ locale: "fr-BE" })).newPage();

/** Textes visibles dont la police affichée n'est pas celle attendue (titres : .font-display ; le reste : texte). */
const offenders = (page: Page, want: { display: string; body: string }) =>
  page.evaluate((w) => {
    const first = (ff: string) =>
      ff
        .split(",")[0]!
        .trim()
        .replace(/^["']|["']$/g, "");
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (
        el.closest("svg, script, style, noscript, iframe, [aria-hidden='true']")
      )
        continue;
      const text = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent!.trim(),
      );
      if (
        !text &&
        !el.matches("input:not([type=hidden]), textarea, select, button")
      )
        continue;
      const cs = getComputedStyle(el);
      if (!el.getClientRects().length || cs.visibility === "hidden") continue;
      const expected = el.closest(".font-display") ? w.display : w.body;
      const shown = first(cs.fontFamily);
      if (shown !== expected) {
        const cls =
          typeof el.className === "string"
            ? el.className.split(/\s+/).slice(0, 3).join(".")
            : "";
        out.push(
          `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} « ${(el.innerText || (el as HTMLInputElement).value || "").trim().slice(0, 32)} » : ${shown} (attendu ${expected})`,
        );
      }
    }
    return out;
  }, want);
const loaded = (page: Page, family: string) =>
  page.evaluate(async (f) => {
    await document.fonts.ready;
    return document.fonts.check(`16px "${f}"`);
  }, family);

test("Space Grotesk choisie : chaque texte de la billetterie et du panier dans cette police ; bouton à la couleur et à l'arrondi choisis", async ({
  page,
  browser,
}) => {
  const url = await brandedEvent(page, {
    headingFont: "space-grotesk",
    bodyFont: "space-grotesk",
    accentColor: "#1D4ED8",
    radius: "square",
  });
  const buyer = await visitor(browser);
  await buyer.goto(url);
  const box = buyer.locator("#billets");
  await expect(
    box.getByRole("button", { name: "Un billet Fosse de plus" }),
  ).toBeVisible();
  expect(await loaded(buyer, "Space Grotesk")).toBe(true);
  expect(
    await offenders(buyer, { display: "Space Grotesk", body: "Space Grotesk" }),
  ).toEqual([]);

  await box.getByRole("button", { name: "Un billet Fosse de plus" }).click();
  const next = box.getByRole("button", { name: "Continuer" });
  const look = await next.evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    radius: getComputedStyle(el).borderTopLeftRadius,
  }));
  expect(look).toEqual({ bg: "rgb(29, 78, 216)", radius: "0px" });
  await next.click();
  await expect(box.getByLabel("Adresse e-mail")).toBeVisible();
  expect(
    await offenders(buyer, { display: "Space Grotesk", body: "Space Grotesk" }),
  ).toEqual([]); // panier : libellés, champs, boutons
});

test("titres et texte dans deux polices différentes : chacune à sa place, rien dans la police d'Evoly", async ({
  page,
  browser,
}) => {
  const url = await brandedEvent(page, {
    headingFont: "playfair-display",
    bodyFont: "inter",
    accentColor: "#7C2D12",
    radius: "round",
  });
  const buyer = await visitor(browser);
  await buyer.goto(url);
  await expect(
    buyer
      .locator("#billets")
      .getByRole("button", { name: "Un billet Fosse de plus" }),
  ).toBeVisible();
  expect([
    await loaded(buyer, "Playfair Display"),
    await loaded(buyer, "Inter"),
  ]).toEqual([true, true]);
  expect(
    await offenders(buyer, { display: "Playfair Display", body: "Inter" }),
  ).toEqual([]);
});
