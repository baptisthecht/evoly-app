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
      include: ["src/components/**/*.tsx"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage-components",
      thresholds: { statements: 11, branches: 9, functions: 6, lines: 13 }, // 18 octobre 2026 : 16 tests (caméra, barre, scanner)
    },
  },
});
