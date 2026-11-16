import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appleClientSecret,
  MAX_DAYS,
} from "../../../ops/apple-client-secret.mjs";
import { trustedOriginsFor } from "@/lib/authOrigins";

// Connexion avec Apple (lot 4) : le secret AUTH_APPLE_SECRET est un jeton ES256 signé avec la clé .p8 d'Apple
const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const base = {
  teamId: "ABCDE12345",
  keyId: "XYZ987WVU6",
  servicesId: "me.evoly.app.signin",
  privateKeyPem: pem,
  now: 1_794_787_200, // 16 novembre 2026, 00:00 UTC
};
const decode = (part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("secret de la connexion avec Apple (ops/apple-client-secret.mjs)", () => {
  it("jeton ES256 : kid, iss, sub, aud d'Apple, 180 jours au plus, signature vérifiable", () => {
    const { token, expiresAt } = appleClientSecret(base);
    const [h, p, s] = token.split(".");
    expect(decode(h!)).toEqual({ alg: "ES256", kid: "XYZ987WVU6", typ: "JWT" });
    expect(decode(p!)).toEqual({
      iss: "ABCDE12345",
      iat: base.now,
      exp: base.now + MAX_DAYS * 86_400,
      aud: "https://appleid.apple.com",
      sub: "me.evoly.app.signin",
    });
    expect(expiresAt.toISOString()).toBe("2027-05-15T00:00:00.000Z");
    // signature JOSE (r || s sur 64 octets), vérifiée avec la clé publique
    expect(Buffer.from(s!, "base64url")).toHaveLength(64);
    expect(
      verify(
        "sha256",
        Buffer.from(`${h}.${p}`),
        { key: ec.publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(s!, "base64url"),
      ),
    ).toBe(true);
  });

  it("refus : plus de 180 jours, identifiants mal formés, clé qui n'est pas une clé EC", () => {
    expect(() => appleClientSecret({ ...base, days: 181 })).toThrow(/Durée/);
    expect(() => appleClientSecret({ ...base, teamId: "abc" })).toThrow(
      /Team ID/,
    );
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() =>
      appleClientSecret({
        ...base,
        privateKeyPem: rsa.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      }),
    ).toThrow(/clé EC/);
    expect(
      appleClientSecret({ ...base, days: 30 }).expiresAt.toISOString(),
    ).toBe("2026-12-16T00:00:00.000Z");
  });
});

describe("origines de confiance de la connexion", () => {
  it("Apple renvoie la connexion par un formulaire depuis son domaine : accepté seulement si Apple est configuré", () => {
    expect(trustedOriginsFor({ AUTH_APPLE_ID: "me.evoly.app.signin" })).toEqual(
      ["https://appleid.apple.com"],
    );
    expect(trustedOriginsFor({})).toEqual([]);
  });
});
