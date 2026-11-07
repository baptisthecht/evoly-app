import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/server/email/send";

const rid = () => Math.random().toString(36).slice(2, 8);

describe("boîte d'envoi locale (développement, tests, parcours complets)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("l'e-mail apparaît complet sous son nom définitif, sans fichier provisoire laissé", async () => {
    const to = `boite.${rid()}@exemple.be`;
    await sendEmail({
      to,
      subject: "Vos billets",
      html: "<p>Bonjour</p>",
      text: "Bonjour",
      template: "order.lookup",
      category: "TRANSACTIONAL",
    });
    const dir = process.env.EMAIL_OUTBOX_DIR!;
    const mine = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
      .filter((m) => m.to === to);
    expect(mine).toMatchObject([
      { subject: "Vos billets", template: "order.lookup" },
    ]);
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("parcours complets : un fichier d'e-mail encore vide (en cours d'écriture) est ignoré, pas une erreur", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "evoly-boite-"));
    writeFileSync(
      path.join(dir, "1-a.json"),
      JSON.stringify({
        to: "lea@exemple.be",
        template: "order.lookup",
        subject: "Vos billets",
        text: "Bonjour",
      }),
    );
    writeFileSync(path.join(dir, "2-b.json"), ""); // plus récent, lu en premier
    vi.stubEnv("EMAIL_OUTBOX_DIR", dir);
    const { lastEmail } = await import("../e2e/outbox");
    expect((await lastEmail("lea@exemple.be", "order.lookup")).subject).toBe(
      "Vos billets",
    );
  });
});
