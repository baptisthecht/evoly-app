import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

const { sealer } = await import("@/lib/seal");
const { env } = await import("@/lib/env");

describe("secrets chiffrés en base (lib/seal.ts)", () => {
  it("chiffre et déchiffre ; vecteur aléatoire, donc deux chiffrés différents pour le même secret", () => {
    const s = sealer("essai");
    const a = s.seal("jeton-très-secret");
    const b = s.seal("jeton-très-secret");
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret");
    expect(s.open(a)).toBe("jeton-très-secret");
    expect(s.open(b)).toBe("jeton-très-secret");
  });

  it("une clé par usage : un secret d'un usage ne s'ouvre pas avec un autre, ni une fois altéré", () => {
    const blob = sealer("mollie-oauth").seal("refresh");
    expect(() => sealer("2fa").open(blob)).toThrow();
    const raw = Buffer.from(blob, "base64url");
    raw[raw.length - 1]! ^= 1;
    expect(() =>
      sealer("mollie-oauth").open(raw.toString("base64url")),
    ).toThrow();
  });

  it("même format qu'avant la mise en commun : les secrets déjà chiffrés (double authentification, prospection) s'ouvrent toujours", () => {
    for (const purpose of ["2fa", "prospection"]) {
      // ancien chiffrement, tel qu'il était écrit dans twoFactor.ts et prospection.ts
      const key = createHash("sha256")
        .update(`${purpose}:${env().BETTER_AUTH_SECRET}`)
        .digest();
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([c.update("ancien secret", "utf8"), c.final()]);
      const legacy = Buffer.concat([iv, c.getAuthTag(), ct]).toString(
        "base64url",
      );
      expect(sealer(purpose).open(legacy)).toBe("ancien secret");
    }
  });
});
