import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { CoreError } from "@evoly/core";
import { cookies } from "next/headers";
import * as OTPAuth from "otpauth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import { hit } from "./rateLimit";

/**
 * Double authentification TOTP (US-AUTH-06, obligatoire pour le back-office) : secret chiffré (AES-256-GCM),
 * 8 codes de secours hachés à usage unique, validation liée à la session (cookie signé, 12 heures).
 */
const aesKey = () => createHash("sha256").update(`2fa:${env().BETTER_AUTH_SECRET}`).digest();
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", aesKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}
export function decryptSecret(blob: string): string {
  const raw = Buffer.from(blob, "base64url");
  const d = createDecipheriv("aes-256-gcm", aesKey(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}
export const totpFor = (secret: string, label: string) =>
  new OTPAuth.TOTP({ issuer: "Evoly", label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });

const COOKIE = "evoly_2fa";
const mark = (sessionId: string, userId: string) =>
  createHmac("sha256", `2fa-session:${env().BETTER_AUTH_SECRET}`).update(`${sessionId}:${userId}`).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hashCode = (code: string) =>
  createHash("sha256")
    .update(`recovery:${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`)
    .digest("hex");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const recoveryCode = () => Array.from({ length: 8 }, (_, i) => (i === 4 ? "-" : "") + ALPHABET[randomInt(ALPHABET.length)]).join("");

/** La session courante a-t-elle validé la double authentification ? (toujours vrai si elle n'est pas activée) */
export async function twoFactorSatisfied(user: { id: string; twoFactorEnabled?: boolean | null }, sessionId: string): Promise<boolean> {
  if (!user.twoFactorEnabled) return true;
  return same((await cookies()).get(COOKIE)?.value ?? "", mark(sessionId, user.id));
}

/** Enregistrement : secret créé (ou repris s'il est en attente), jamais montré une fois la double authentification active. */
export async function setupSecret(userId: string, email: string) {
  const row = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorSecret: true, twoFactorEnabled: true } });
  if (row.twoFactorEnabled) return null;
  const secret = row.twoFactorSecret ? decryptSecret(row.twoFactorSecret) : new OTPAuth.Secret({ size: 20 }).base32;
  if (!row.twoFactorSecret) await db.user.update({ where: { id: userId }, data: { twoFactorSecret: encryptSecret(secret) } });
  return { secret, uri: totpFor(secret, email).toString() };
}

async function checkCode(userId: string, email: string, code: string): Promise<"TOTP" | "RECOVERY" | null> {
  if ((await hit(`2fa:${userId}`, 900)) > 10) throw new CoreError("RATE_LIMITED");
  const row = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorSecret: true, twoFactorBackupCodes: true } });
  const clean = code.trim();
  if (
    row.twoFactorSecret &&
    /^\d{6}$/.test(clean.replace(/\s/g, "")) &&
    totpFor(decryptSecret(row.twoFactorSecret), email).validate({ token: clean.replace(/\s/g, ""), window: 1 }) !== null
  )
    return "TOTP";
  const h = hashCode(clean);
  if (clean.length >= 8 && row.twoFactorBackupCodes.includes(h)) {
    // code de secours : usage unique
    await db.user.update({ where: { id: userId }, data: { twoFactorBackupCodes: row.twoFactorBackupCodes.filter((c) => c !== h) } });
    return "RECOVERY";
  }
  return null;
}

async function markSession(userId: string, sessionId: string) {
  (await cookies()).set(COOKIE, mark(sessionId, userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NEXT_PUBLIC_APP_URL.startsWith("https"),
    path: "/",
    maxAge: 12 * 3600,
  });
}

/** Activation : premier code correct → double authentification active et 8 codes de secours, montrés une seule fois. */
export async function enableTwoFactor(user: { id: string; email: string }, sessionId: string, code: string): Promise<string[] | null> {
  if ((await checkCode(user.id, user.email, code)) !== "TOTP") return null;
  const codes = Array.from({ length: 8 }, recoveryCode);
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorBackupCodes: codes.map(hashCode) } });
  await markSession(user.id, sessionId);
  await audit({ action: "account.2fa_enabled", actorUserId: user.id, targetType: "User", targetId: user.id });
  return codes;
}

/** Connexion : code de l'application ou code de secours ; journalisé. */
export async function verifyTwoFactor(user: { id: string; email: string }, sessionId: string, code: string): Promise<boolean> {
  const kind = await checkCode(user.id, user.email, code);
  await audit({
    action: kind ? `account.2fa_verified_${kind.toLowerCase()}` : "account.2fa_failed",
    actorUserId: user.id,
    targetType: "User",
    targetId: user.id,
  });
  if (!kind) return false;
  await markSession(user.id, sessionId);
  return true;
}

/** Désactivation (organisateurs) : code exigé ; impossible pour l'équipe Evoly, pour qui elle est obligatoire. */
export async function disableTwoFactor(user: { id: string; email: string }, code: string) {
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { platformRole: true } });
  if (row.platformRole !== "NONE") throw new CoreError("TWO_FACTOR_REQUIRED_FOR_STAFF");
  if (!(await checkCode(user.id, user.email, code))) throw new CoreError("TWO_FACTOR_CODE_WRONG");
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] } });
  await audit({ action: "account.2fa_disabled", actorUserId: user.id, targetType: "User", targetId: user.id });
}

/** Nouveaux codes de secours (les anciens ne fonctionnent plus), code exigé. */
export async function regenerateRecoveryCodes(user: { id: string; email: string }, code: string): Promise<string[]> {
  if ((await checkCode(user.id, user.email, code)) !== "TOTP") throw new CoreError("TWO_FACTOR_CODE_WRONG");
  const codes = Array.from({ length: 8 }, recoveryCode);
  await db.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: codes.map(hashCode) } });
  await audit({ action: "account.2fa_recovery_regenerated", actorUserId: user.id, targetType: "User", targetId: user.id });
  return codes;
}

export async function remainingRecoveryCodes(userId: string): Promise<number> {
  return (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorBackupCodes: true } })).twoFactorBackupCodes.length;
}
