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
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage-components",
      thresholds: { statements: 75, branches: 69, functions: 70, lines: 76 }, // 21 octobre 2026 : 374 tests (75,5 / 69,1 / 71,2 / 77,3) ; marge pour la CI, jamais à la baisse
    },
  },
});
