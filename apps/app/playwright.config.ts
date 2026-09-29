import { defineConfig } from "@playwright/test";

/**
 * Tests de parcours complets (CDC 14.1). Prérequis : app démarrée sur une base de test,
 * EMAIL_OUTBOX_DIR défini (les e-mails y sont écrits au lieu d'être envoyés).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    locale: "fr-BE",
    trace: "retain-on-failure",
    // les domaines en .test (domaines personnalisés des tests) pointent vers le serveur local
    launchOptions: { ...(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}), args: ["--host-resolver-rules=MAP *.test 127.0.0.1"] },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
