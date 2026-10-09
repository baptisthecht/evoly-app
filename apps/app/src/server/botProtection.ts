import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hit } from "./rateLimit";

/**
 * RG-BUY-10 (P1) : protection anti-robots activable par événement. Défi de calcul auto-hébergé (même principe qu'Altcha) :
 * le navigateur trouve un nombre dont l'empreinte SHA-256 commence par assez de bits nuls avant de réserver. Invisible
 * pour une personne (moins d'une seconde), très coûteux pour un robot qui réserve en masse. Sans service tiers ni cookie.
 */
export const BOT_DIFFICULTY = 14; // bits nuls : environ 16 000 essais en moyenne
const TTL_MS = 10 * 60_000;

export type BotChallenge = { salt: string; difficulty: number; expires: number; signature: string };
export type BotProof = BotChallenge & { nonce: number };

const secret = () => env().ORDER_TOKEN_SECRET ?? env().BETTER_AUTH_SECRET;
const sign = (eventId: string, c: Omit<BotChallenge, "signature">) =>
  createHmac("sha256", secret()).update(`${eventId}|${c.salt}|${c.difficulty}|${c.expires}`).digest("hex");

export function leadingZeroBits(bytes: Uint8Array): number {
  let n = 0;
  for (const b of bytes) {
    if (b === 0) {
      n += 8;
      continue;
    }
    n += Math.clz32(b) - 24;
    break;
  }
  return n;
}

export function createChallenge(eventId: string, now = Date.now(), difficulty = BOT_DIFFICULTY): BotChallenge {
  const c = { salt: randomBytes(16).toString("hex"), difficulty, expires: now + TTL_MS };
  return { ...c, signature: sign(eventId, c) };
}

/** Vérifie la preuve : signature, validité, calcul ; une seule utilisation par défi. */
export async function verifyProof(eventId: string, proof: unknown, now = Date.now()): Promise<boolean> {
  if (!proof || typeof proof !== "object") return false;
  const p = proof as Partial<BotProof>;
  if (typeof p.salt !== "string" || !/^[0-9a-f]{32}$/.test(p.salt) || typeof p.nonce !== "number" || !Number.isInteger(p.nonce) || p.nonce < 0) return false;
  if (typeof p.difficulty !== "number" || p.difficulty < BOT_DIFFICULTY || typeof p.expires !== "number" || p.expires < now || typeof p.signature !== "string")
    return false;
  const expected = Buffer.from(sign(eventId, { salt: p.salt, difficulty: p.difficulty, expires: p.expires }), "hex");
  const given = Buffer.from(p.signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  if (leadingZeroBits(createHash("sha256").update(`${p.salt}${p.nonce}`).digest()) < p.difficulty) return false;
  return (await hit(`bot:${p.salt}`, Math.ceil(TTL_MS / 1000))) === 1;
}

export async function botProtected(eventId: string): Promise<boolean> {
  const e = await db.event.findUnique({ where: { id: eventId }, select: { botProtection: true } });
  return !!e?.botProtection;
}
