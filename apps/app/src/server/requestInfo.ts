import "server-only";
import { headers } from "next/headers";

/**
 * Adresse IP du client, pour la limitation de débit et le journal d'audit.
 * Seules les entrées ajoutées par nos proxys de confiance comptent : on lit X-Forwarded-For en partant
 * de la droite (TRUSTED_PROXY_HOPS, 1 par défaut). Les valeurs ajoutées à gauche par un client sont ignorées.
 */
export function ipFrom(h: Headers): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
  const parts = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts[Math.max(0, parts.length - hops)]!;
  return h.get("x-real-ip") ?? "unknown";
}

export async function clientIp(): Promise<string> {
  return ipFrom(await headers());
}
