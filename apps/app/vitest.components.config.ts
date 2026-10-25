import path from "node:path";
import { defineConfig } from "vitest/config";

/** Tests des composants du navigateur (React), dans un navigateur simulé (jsdom) : aucune base de données. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  esbuild: { jsx: "automatic" },
  test: {
    include: ["test/components/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["test/components/setup.ts"],
    // couverture de tous les composants, même ceux qui n'ont pas encore de test ; cliquet : plancher relevé, jamais abaissé
    coverage: {
      provider: "v8",
      include: ["src/components/**/*.tsx", "src/app/**/[A-Z]*.tsx"], // composants du dossier components et écrans du tableau de bord (les fichiers de route, en minuscules, sont exclus)
      // composants serveur asynchrones (données lues côté serveur) : cette suite ne peut pas les rendre ; les parcours complets
      // (Playwright) les exercent. Liste explicite, décidée le 21 octobre 2026 : un nouveau fichier n'en sort pas sans décision.
      exclude: [
        "src/components/public/Prepublished.tsx",
        "src/components/public/EventPage.tsx",
        "src/components/shell/SectionHeader.tsx",
        "src/components/public/EventPublicView.tsx",
        "src/components/ProLocked.tsx",
        "src/components/public/PublicShell.tsx",
        "src/components/orders/OrderHeader.tsx",
        "src/components/shell/OrgNav.tsx",
        "src/components/shell/OrgSwitcher.tsx",
        "src/components/shell/EventHeader.tsx",
        "src/components/shell/OrgTabBar.tsx", // barre d'onglets du téléphone : parcours complets sur téléphone
        "src/components/shell/EventTabBar.tsx",
        "src/app/(auth)/SocialButtons.tsx",
        "src/app/o/[orgSlug]/StripeBanner.tsx",
        "src/app/onboarding/Steps.tsx",
        "src/components/LocaleSwitch.tsx",
        "src/components/public/DisabledSite.tsx",
        "src/components/shell/AccountMenu.tsx",
      ],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage-components",
      thresholds: { statements: 84, branches: 79, functions: 79, lines: 86 }, // 21 octobre 2026 : 410 tests, objectif atteint (85,0 / 80,0 / 79,9 / 87,2) ; marge pour la CI, jamais à la baisse
    },
  },
});
