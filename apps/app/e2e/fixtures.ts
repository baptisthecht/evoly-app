import { mkdirSync, writeFileSync } from "node:fs";
import { test as base } from "@playwright/test";

export * from "@playwright/test";

/**
 * Fonction de test des parcours complets. Avec E2E_COVERAGE_DIR, elle enregistre le code exécuté dans chaque page
 * (Chromium) pour la mesure de couverture ; sans, c'est exactement celle de Playwright.
 */
const dir = process.env.E2E_COVERAGE_DIR;
export const test = dir
  ? base.extend<{ coverage: void }>({
      coverage: [
        async ({ page }, use, testInfo) => {
          await page.coverage.startJSCoverage({ resetOnNavigation: false });
          await use();
          const entries = (await page.coverage.stopJSCoverage()).filter((e) => e.url.includes("/_next/static/"));
          mkdirSync(dir, { recursive: true });
          writeFileSync(`${dir}/${testInfo.testId}-${testInfo.repeatEachIndex}-${Date.now()}.json`, JSON.stringify(entries));
        },
        { auto: true },
      ],
    })
  : base;
