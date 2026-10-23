import "server-only";
import { connect } from "node:http2";
import type { AppleCredentials } from "./apple";

/**
 * Notification Apple Wallet (RG-POST-04) : vide, avec le pass comme sujet ; le téléphone redemande alors le pass au service web.
 * Renvoie les jetons qu'Apple déclare périmés (410), à oublier.
 */
export async function sendApplePushes(
  tokens: string[],
  creds: AppleCredentials,
): Promise<string[]> {
  if (tokens.length === 0) return [];
  const client = connect("https://api.push.apple.com", {
    cert: creds.certPem,
    key: creds.keyPem,
    ...(creds.passphrase ? { passphrase: creds.passphrase } : {}),
  });
  client.on("error", () => undefined);
  const gone: string[] = [];
  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const req = client.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              "apns-topic": creds.passTypeIdentifier,
              "content-type": "application/json",
            });
            req.on("response", (h) => {
              if (h[":status"] === 410) gone.push(token);
            });
            req.on("error", () => resolve());
            req.on("close", () => resolve());
            req.resume();
            req.end("{}");
          }),
      ),
    );
  } finally {
    client.close();
  }
  return gone;
}
