import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "./env";

/**
 * Secrets gardés en base, chiffrés en AES-256-GCM avec une clé propre à chaque usage, dérivée de BETTER_AUTH_SECRET.
 * Format : base64url(vecteur 12 octets | étiquette 16 octets | texte chiffré).
 */
export function sealer(purpose: string) {
  const key = () =>
    createHash("sha256")
      .update(`${purpose}:${env().BETTER_AUTH_SECRET}`)
      .digest();
  return {
    seal(plain: string): string {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key(), iv);
      const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
    },
    open(blob: string): string {
      const raw = Buffer.from(blob, "base64url");
      const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString(
        "utf8",
      );
    },
  };
}
