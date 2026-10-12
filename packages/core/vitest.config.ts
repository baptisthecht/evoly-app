import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      // cliquet (docs/MAINTENANCE.md) : seuils relevés au niveau atteint, jamais abaissés
      thresholds: { lines: 99, functions: 100, branches: 93, statements: 98 },
    },
  },
});
