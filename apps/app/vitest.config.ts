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
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://evoly:evoly@localhost:5432/evoly",
      EMAIL_OUTBOX_DIR: process.env.EMAIL_OUTBOX_DIR ?? path.join(os.tmpdir(), "evoly-test-outbox"),
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "secret-de-test-pour-les-liens-magiques-0123456789",
    },
  },
});
