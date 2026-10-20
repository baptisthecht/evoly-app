import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

/** Tests d'intégration du serveur, sur une vraie base PostgreSQL (DATABASE_URL). */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "test/server-only-stub.ts") },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    // couverture du code serveur ; cliquet (docs/MAINTENANCE.md) : plancher relevé à chaque série de tests ajoutés, jamais abaissé
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["src/generated/**"],
      reporter: ["text", "text-summary", "json-summary"], // tableau par fichier dans le journal de la CI : les moins couverts d'abord
      thresholds: { statements: 89, branches: 78, functions: 89, lines: 94 } /* 18 octobre 2026 : 521 tests, mesurés contre PostgreSQL 16 */,
    },
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://evoly:evoly@localhost:5432/evoly",
      LAUNCH_OFFER_UNTIL: "off", // offre de lancement désactivée : les tests vérifient l'offre Free (test dédié : launch-offer)
      EMAIL_OUTBOX_DIR: process.env.EMAIL_OUTBOX_DIR ?? path.join(os.tmpdir(), "evoly-test-outbox"),
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "secret-de-test-pour-les-liens-magiques-0123456789",
    },
  },
});
