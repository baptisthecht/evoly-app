import "server-only";
import { secretToken } from "@evoly/core";
import { db } from "@/lib/db";

/**
 * Limitation de débit partagée entre instances (table RateLimit, format Better Auth).
 * La fenêtre repart de la dernière requête : tant qu'on insiste, on reste bloqué.
 */
export async function hit(key: string, windowSeconds: number): Promise<number> {
  const now = BigInt(Date.now());
  const windowMs = BigInt(windowSeconds * 1000);
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest") VALUES (${secretToken(12)}, ${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN ${now} - "RateLimit"."lastRequest" > ${windowMs} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "lastRequest" = ${now}
    RETURNING "count"`;
  return rows[0]?.count ?? 1;
}

/** Nombre de tentatives en cours dans la fenêtre, sans en ajouter. */
export async function peek(key: string, windowSeconds: number): Promise<number> {
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row) return 0;
  return Date.now() - Number(row.lastRequest) > windowSeconds * 1000 ? 0 : row.count;
}

export async function isLimited(key: string, windowSeconds: number, max: number): Promise<boolean> {
  return (await peek(key, windowSeconds)) >= max;
}

export async function reset(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}
