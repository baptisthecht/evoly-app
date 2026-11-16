#!/usr/bin/env node
// Connexion avec Apple (docs/DEPLOIEMENT.md) : génère AUTH_APPLE_SECRET, le « client secret » qu'Apple exige à la
// place d'un mot de passe fixe. C'est un jeton JWT signé en ES256 avec la clé privée .p8 de « Sign in with Apple » :
// iss = Team ID, sub = Services ID (AUTH_APPLE_ID), aud = https://appleid.apple.com, kid = Key ID ; Apple le refuse
// au-delà de 6 mois, d'où 180 jours au plus. À renouveler avant son expiration (rappel dans docs/A_FAIRE.md).
//
// Usage :
//   node ops/apple-client-secret.mjs --team-id ABCDE12345 --key-id XYZ987WVU6 \
//     --services-id me.evoly.app.signin --key ~/Downloads/AuthKey_XYZ987WVU6.p8 [--days 180]
// Affiche le secret (à mettre dans AUTH_APPLE_SECRET) et sa date d'expiration. Aucune dépendance : node:crypto seul.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

/** Durée maximale acceptée par Apple : 6 mois ; Evoly s'arrête à 180 jours. */
export const MAX_DAYS = 180;

const b64url = (data) =>
  Buffer.from(typeof data === "string" ? data : JSON.stringify(data)).toString(
    "base64url",
  );

/**
 * Jeton signé ES256 (signature JOSE : r || s, 64 octets). `now` en secondes depuis l'époque Unix.
 * Renvoie le jeton et sa date d'expiration.
 */
export function appleClientSecret({
  teamId,
  keyId,
  servicesId,
  privateKeyPem,
  days = MAX_DAYS,
  now = Math.floor(Date.now() / 1000),
}) {
  for (const [name, value, pattern] of [
    ["Team ID", teamId, /^[A-Z0-9]{10}$/],
    ["Key ID", keyId, /^[A-Z0-9]{10}$/],
    ["Services ID", servicesId, /^[A-Za-z0-9.-]+$/],
  ])
    if (typeof value !== "string" || !pattern.test(value))
      throw new Error(`${name} invalide : ${value ?? "(absent)"}`);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS)
    throw new Error(`Durée invalide : ${days} jours (de 1 à ${MAX_DAYS})`);
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ec")
    throw new Error(
      "La clé .p8 attendue est une clé EC (P-256) de « Sign in with Apple »",
    );
  const exp = now + days * 86_400;
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: servicesId,
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return {
    token: `${signingInput}.${signature}`,
    expiresAt: new Date(exp * 1000),
  };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, inline] = a.slice(2).split("=", 2);
    out[k] = inline ?? argv[++i];
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const a = args(process.argv.slice(2));
  const keyPath = (a.key ?? "").replace(/^~(?=\/)/, homedir());
  if (!a["team-id"] || !a["key-id"] || !a["services-id"] || !keyPath) {
    console.error(
      "Usage : node ops/apple-client-secret.mjs --team-id <Team ID> --key-id <Key ID> --services-id <Services ID> --key <AuthKey_….p8> [--days 180]",
    );
    process.exit(1);
  }
  try {
    const { token, expiresAt } = appleClientSecret({
      teamId: a["team-id"],
      keyId: a["key-id"],
      servicesId: a["services-id"],
      privateKeyPem: readFileSync(keyPath, "utf8"),
      days: a.days ? Number(a.days) : MAX_DAYS,
    });
    console.log(`AUTH_APPLE_SECRET=${token}`);
    console.log(
      `Expire le ${expiresAt.toISOString().slice(0, 10)} (${expiresAt.toUTCString()}) : à renouveler avant, puis redéployer.`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
