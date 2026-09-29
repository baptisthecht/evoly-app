import { CoreError } from "@evoly/core";
import { z } from "zod";
import { hit } from "@/server/rateLimit";
import { resolveScannerLink } from "@/server/scanner";

const noStore = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: noStore });
}

/** Lien valide, sinon réponse d'erreur (RG-SCN-05 : 410 pour un lien expiré ou révoqué). */
export async function linkOr410(token: string) {
  const resolved = await resolveScannerLink(token);
  if (!resolved) return { error: json({ error: "UNKNOWN_LINK" }, 404) };
  if (resolved.state !== "OK") return { error: json({ error: resolved.state }, 410) };
  return { link: resolved.link };
}

/** RG-SCN-08 : débit limité par lien et par appareil. */
export async function rateLimited(linkId: string, deviceId: string | null | undefined, weight = 1): Promise<boolean> {
  const perLink = await hit(`scan:link:${linkId}`, 60);
  const perDevice = deviceId ? await hit(`scan:device:${linkId}:${deviceId.slice(0, 64)}`, 60) : 0;
  return perLink > 1200 * weight || perDevice > 240 * weight;
}

export function failure(err: unknown): Response {
  if (err instanceof CoreError) return json({ error: err.code }, 400);
  console.error(err);
  return json({ error: "UNKNOWN" }, 500);
}

/** Un scan : code du QR, code court saisi ou billet choisi dans la liste. */
export const scanSchema = z.object({
  code: z.string().max(200).nullish(),
  shortCode: z.string().max(20).nullish(),
  ticketId: z.string().max(40).nullish(),
  method: z.enum(["QR", "MANUAL_CODE", "LIST"]),
  scannedAt: z.string().max(40).nullish(),
  deviceId: z.string().max(64).nullish(),
});

