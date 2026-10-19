import { mkdirSync, writeFileSync } from "node:fs";
import { test as base, type BrowserContext, type Page } from "@playwright/test";

export * from "@playwright/test";

/**
 * Fonction de test des parcours complets. Avec E2E_COVERAGE_DIR, elle enregistre le code exécuté dans toutes les pages
 * (Chromium), y compris celles des fenêtres que les parcours ouvrent eux-mêmes (organisateur, acheteur, bénévole), et
 * le récupère juste avant leur fermeture ; sans, c'est exactement celle de Playwright.
 */
const dir = process.env.E2E_COVERAGE_DIR;
type Entry = Awaited<ReturnType<Page["coverage"]["stopJSCoverage"]>>[number];

export const test = dir
  ? base.extend<{ coverage: void }>({
      coverage: [
        async ({ browser, context, page }, use, testInfo) => {
          const entries: Entry[] = [];
          const open = new Set<Page>();
          const collect = async (p: Page) => {
            if (!open.delete(p) || p.isClosed()) return;
            entries.push(...(await p.coverage.stopJSCoverage().catch(() => [])));
          };
          const track = async (p: Page) => {
            if (open.has(p)) return;
            open.add(p);
            // attendu avant que le parcours navigue : sinon les scripts de la première page sont perdus
            await p.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => undefined);
            const close = p.close.bind(p);
            p.close = async (options) => {
              await collect(p);
              return close(options);
            };
          };
          const watch = (c: BrowserContext) => {
            c.on("page", (p) => void track(p)); // fenêtres surgissantes
            const newPage = c.newPage.bind(c);
            c.newPage = async () => {
              const p = await newPage();
              await track(p);
              return p;
            };
            const close = c.close.bind(c);
            c.close = async (options) => {
              await Promise.all(c.pages().map(collect));
              return close(options);
            };
          };
          watch(context);
          for (const p of [page, ...context.pages()]) await track(p); // la page par défaut existe déjà
          const newContext = browser.newContext.bind(browser);
          browser.newContext = async (options) => {
            const c = await newContext(options);
            watch(c);
            return c;
          };
          await use();
          browser.newContext = newContext;
          await Promise.all([...open].map(collect));
          mkdirSync(dir, { recursive: true });
          const own = entries.filter((e) => e.url.includes("/_next/static/"));
          writeFileSync(`${dir}/${testInfo.testId}-${testInfo.repeatEachIndex}-${Date.now()}.json`, JSON.stringify(own));
        },
        { auto: true },
      ],
    })
  : base;
