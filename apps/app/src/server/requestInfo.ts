import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

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

/**
 * Site visité (sous-domaine ou domaine personnalisé), construit d'après la requête, jamais reçu tel quel du navigateur :
 * retour après la page de paiement de Mollie. null pour un hôte illisible.
 */
export async function siteOrigin(): Promise<string | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
    .split(",")[0]!
    .trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const forwarded = h.get("x-forwarded-proto");
  const proto =
    forwarded === "http" || forwarded === "https"
      ? forwarded
      : new URL(env().NEXT_PUBLIC_APP_URL).protocol.replace(":", "");
  return `${proto}://${host}`;
}
