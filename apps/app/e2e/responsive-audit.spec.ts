import { type Browser, type Page, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { appUrl, buyFree, organizer, publishedFreeEvent, signUpAndVerify, siteUrl, sql, uid } from "./helpers";

// Audit du responsive (rapport, pas d'assertion) : RESPONSIVE_AUDIT=1 npx playwright test e2e/responsive-audit.spec.ts --project=desktop
test.skip(!process.env.RESPONSIVE_AUDIT, "audit lancé à la demande (RESPONSIVE_AUDIT=1)");
test.setTimeout(60 * 60_000);

/** Relevé dans la page : débordements horizontaux, textes qui sortent de leur cadre, champs < 16 px (zoom iOS). */
const AUDIT = () => {
  const vw = document.documentElement.clientWidth;
  const all = [...document.body.querySelectorAll("*")] as HTMLElement[];
  const clipped = (el: HTMLElement) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.position === "fixed") return true;
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
        const r = p.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  const describe = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const txt = (el.innerText || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 50);
    return `${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(/\s+/).slice(0, 7).join(".")} [${Math.round(r.left)}→${Math.round(r.right)}] «${txt}»`;
  };
  const off = all.filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || (r.right <= vw + 1 && r.left >= -1)) return false;
    return !clipped(el);
  });
  const set = new Set(off);
  const outer = off.filter((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p as HTMLElement)) return false;
    return true;
  });
  const text = all.filter((el) => {
    if (el instanceof SVGElement) return false; // mesures de débordement non fiables pour le SVG
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) return false;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "visible" || cs.display === "inline" || !el.clientWidth) return false;
    return el.scrollWidth > el.clientWidth + 2;
  });
  const small = [
    ...document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), select, textarea",
    ),
  ]
    .filter((el) => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16)
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}[${(el as HTMLInputElement).type || ""}] ${Math.round(parseFloat(getComputedStyle(el).fontSize))}px name=${el.getAttribute("name") ?? ""} .${(el.getAttribute("class") || "").split(/\s+/).slice(0, 4).join(".")}`,
    );
  return {
    docOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
    offenders: outer.slice(0, 6).map(describe),
    textOverflow: text.slice(0, 6).map(describe),
    smallInputs: [...new Set(small)],
  };
};

// textes lus directement (le chargeur de Playwright n'accepte pas les imports JSON du paquet de traduction)
const LOCALES = ["fr", "en", "es", "de", "it", "pt", "nl"] as const;
type Locale = (typeof LOCALES)[number];
const MESSAGES = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`../../packages/i18n/messages/${l}.json`, "utf-8"))])) as Record<
  Locale,
  Record<string, unknown>
>;

type Result = { page: string; locale: string; width: number; docOverflow: number; offenders: string[]; textOverflow: string[]; smallInputs: string[] };
const results: Result[] = [];
const msg = (l: Locale, path: string, vars: Record<string, string> = {}) => {
  let v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], MESSAGES[l]) as string;
  for (const [k, x] of Object.entries(vars)) v = v.replace(`{${k}}`, x);
  return v;
};

async function audit(page: Page, name: string, locale: string, width: number) {
  await page.waitForTimeout(250);
  const r = await page.evaluate(AUDIT);
  results.push({ page: name, locale, width, ...r });
}

async function visit(page: Page, name: string, url: string, locale: string, width: number) {
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await audit(page, name, locale, width);
    if (process.env.AUDIT_SHOTS)
      await page.screenshot({ path: `/tmp/responsive/shots/${locale}-${width}-${name.normalize("NFD").replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: true });
  } catch (e) {
    results.push({
      page: name,
      locale,
      width,
      docOverflow: -1,
      offenders: [`ERREUR : ${(e as Error).message.slice(0, 120)}`],
      textOverflow: [],
      smallInputs: [],
    });
  }
}

test("audit du responsive : chaque page, chaque langue, plusieurs largeurs", async ({ page, browser }) => {
  // données : organisation Pro, événement publié, billets achetés, deuxième compte pour l'onboarding et la double authentification
  const { id, slug } = await organizer(page);
  const orgId = sql(`select id from "Organization" where slug = '${slug}'`);
  sql(
    `insert into "Subscription" (id, "organizationId", "planId", status, "currentPeriodEnd", "updatedAt") values ('s_${orgId}', '${orgId}', 'pro', 'ACTIVE', now() + interval '30 days', now()) on conflict ("organizationId") do update set "planId" = 'pro', status = 'ACTIVE', "currentPeriodEnd" = now() + interval '30 days'`,
  );
  const eventUrl = await publishedFreeEvent(page, slug, `Festival des lumières ${id}`, 50);
  const eventId = eventUrl.split("/").pop()!;
  const eventSlug = sql(`select slug from "Event" where id = '${eventId}'`);
  await buyFree(page, siteUrl(slug, `/${eventSlug}`), "Fosse", 2, `lea.${id}@exemple.be`);
  const ticketsUrl = page.url();
  const orderId = sql(`select id from "Order" where "eventId" = '${eventId}' limit 1`);
  await page.goto(appUrl(`/o/${slug}`));
  const organizerState = await page.context().storageState();

  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  const email2 = `sans-orga${id}@exemple.be`;
  await signUpAndVerify(p2, email2);
  const newcomerState = await ctx2.storageState();
  await ctx2.close();

  const org = `/o/${slug}`;
  const ev = `${org}/events/${eventId}`;
  const appPages: Array<[string, string]> = [
    ["tableau de bord", org],
    ["événements", `${org}/events`],
    ["nouvel événement", `${org}/events/new`],
    ["événement : aperçu", ev],
    ["événement : billets", `${ev}/tickets`],
    ["événement : codes promo", `${ev}/promo`],
    ["événement : entrées", `${ev}/entries`],
    ["événement : revente", `${ev}/resale`],
    ["événement : plan de salle", `${ev}/seating`],
    ["événement : réglages", `${ev}/settings`],
    ["événement : prévisualisation", `${ev}/preview`],
    ["commandes", `${org}/orders`],
    ["commande", `${org}/orders/${orderId}`],
    ["revente", `${org}/resale`],
    ["marketing", `${org}/marketing`],
    ["campagnes", `${org}/marketing?tab=campaigns`],
    ["nouvelle campagne", `${org}/marketing/campaigns/new`],
    ["finances", `${org}/finances`],
    ["membres", `${org}/members`],
    ["rôles", `${org}/members?tab=roles`],
    ["marque", `${org}/brand`],
    ["abonnement", `${org}/billing`],
    ["paramètres", `${org}/settings`],
    ["encaissement", `${org}/settings/payments`],
    ["notifications", `${org}/notifications`],
    ["sécurité du compte", "/compte/securite"],
    ["accès scanner", "/acces-scanner"],
  ];
  const publicPages: Array<[string, string]> = [
    ["billetterie", siteUrl(slug)],
    ["page d'événement", siteUrl(slug, `/${eventSlug}`)],
    ["retrouver mes billets", siteUrl(slug, "/billets")],
    ["page des billets", ticketsUrl],
    ["espace participant", appUrl("/mon-espace")],
    ["désinscription", appUrl("/desinscription/inconnu")],
    ["invitation", appUrl("/invitations/inconnue")],
    ["scanner", appUrl("/scanner")],
    ["lien bénévole expiré", appUrl("/scanner/s/inconnu")],
    ["connexion", appUrl("/login")],
    ["inscription", appUrl("/register")],
    ["mot de passe oublié", appUrl("/forgot-password")],
    ["nouveau mot de passe", appUrl("/reset-password")],
  ];
  // AUDIT_COMBOS="fr:1440,de:1440" pour d'autres combinaisons ; AUDIT_SHOTS=1 pour des captures pleine page dans /tmp/responsive/shots
  const combos: Array<[Locale, number]> = process.env.AUDIT_COMBOS
    ? process.env.AUDIT_COMBOS.split(",").map((c) => {
        const [l, w] = c.split(":");
        return [l as Locale, Number(w)];
      })
    : [...LOCALES.map((l) => [l, 360] as [Locale, number]), ["fr", 320], ["de", 320]];

  for (const [locale, width] of combos) {
    const opts = { viewport: { width, height: width >= 1024 ? 900 : 780 }, isMobile: width < 1024, hasTouch: width < 1024, locale };
    const c = await browser.newContext({ ...opts, storageState: organizerState });
    const p = await c.newPage();
    for (const [name, path] of appPages) await visit(p, name, appUrl(path), locale, width);
    // états ouverts : menu mobile du tableau de bord, sélecteur de langue
    await p.goto(appUrl(org));
    const menu = p.getByRole("button", { name: msg(locale, "nav.menu"), exact: true });
    if (await menu.isVisible().catch(() => false)) {
      await menu.click();
      await audit(p, "menu mobile ouvert", locale, width);
    }
    await c.close();

    const pub = await browser.newContext(opts);
    const q = await pub.newPage();
    for (const [name, url] of publicPages) await visit(q, name, url, locale, width);
    try {
      await q.goto(siteUrl(slug, `/${eventSlug}`));
      const box = q.locator("#billets");
      await box.getByRole("button", { name: msg(locale, "public.more", { name: "Fosse" }) }).click();
      await box.getByRole("button", { name: msg(locale, "public.continue") }).click();
      await q.waitForTimeout(400);
      await audit(q, "paiement : coordonnées", locale, width);
      const sw = q.locator("details summary").first();
      if (await sw.isVisible().catch(() => false)) {
        await sw.click();
        await audit(q, "sélecteur de langue ouvert", locale, width);
      }
    } catch (e) {
      results.push({
        page: "paiement : coordonnées",
        locale,
        width,
        docOverflow: -1,
        offenders: [`ERREUR : ${(e as Error).message.slice(0, 120)}`],
        textOverflow: [],
        smallInputs: [],
      });
    }
    await pub.close();

    const nc = await browser.newContext({ ...opts, storageState: newcomerState });
    const n = await nc.newPage();
    await visit(n, "onboarding", appUrl("/onboarding"), locale, width);
    await nc.close();
    writeFileSync("/tmp/responsive/app.json", JSON.stringify(results, null, 1));
  }

  // double authentification : compte de l'onboarding, 2FA activée sans être validée dans la session
  sql(`update "User" set "twoFactorEnabled" = true where email = '${email2}'`);
  for (const [locale, width] of combos) {
    const c = await browser.newContext({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true, locale, storageState: newcomerState });
    const p = await c.newPage();
    await visit(p, "double authentification", appUrl("/2fa"), locale, width);
    await c.close();
  }
  writeFileSync("/tmp/responsive/app.json", JSON.stringify(results, null, 1));
  void (browser as Browser);
  void uid;
});
