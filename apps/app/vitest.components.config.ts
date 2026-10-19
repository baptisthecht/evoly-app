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
      thresholds: { statements: 61, branches: 57, functions: 54, lines: 63 }, // 18 octobre 2026 : mesure complète
    },
  },
});
