import "server-only";
import { createSign } from "node:crypto";
import type { GoogleCredentials } from "./google";

const b64url = (s: string) => Buffer.from(s).toString("base64url");

/** Jeton d'accès du compte de service Google Wallet (RG-POST-04). */
export async function googleAccessToken(creds: GoogleCredentials, fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: creds.serviceAccountEmail, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  );
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(creds.privateKeyPem).toString("base64url");
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Google Wallet : jeton refusé (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Met à jour un événement ou un billet chez Google ; 404 : jamais ajouté à Google Wallet. */
export async function patchGoogle(kind: "eventTicketClass" | "eventTicketObject", id: string, body: unknown, token: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`https://walletobjects.googleapis.com/walletobjects/v1/${kind}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.status;
}
